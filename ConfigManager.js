const log4js = require('log4js')
const redis = require('redis')
const NRP = require('node-redis-pubsub')
const bluebird = require('bluebird')
const TYPE = require('./Type')
bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

const redisLog = log4js.configure('conf/log4js.json').getLogger('redis')
const logger = log4js.configure('conf/log4js.json').getLogger()

const CONFIG_CHANGED = 'config changed';

/**
 * 扩展 Array 的两个方法
 * pushHead 和 popHead
 */
Array.prototype.pushHead = function(){
    for(var i = 0 ;i<arguments.length;i++){
        this.splice(i,0,arguments[i]);
    }
}

Array.prototype.popHead = function(count){
    if(typeof count === "undefined"){
        let head = this[0];
        this.splice(0, 1);
        return head;
    }
    if(typeof count === "number"){
        let head = this.splice(0,count);
        this.splice(count);
        return head;
    }
}


class ConfigManger{
    constructor(redisAuthor, configName, id){
        this.id = id;
        this.client = null;
        this.subClient = null;
        this.nrp = null;
        this.redisAuthor = redisAuthor;
        this.configName = configName;
        this.pubReady = pubReady;
        this.subReady = subReady;
        this.ready = ready;
    }
    async init(){
        let self = this;
        this.map = new Map();
        this.keys = new Set();
        let ret = await this.client.smembersAsync(this.configName);
        for(let key of ret){
            this.keys.add(key);
        }
        for(let key of this.keys){
            logger.info(`key: ${key}`)
            let type = await this.client.typeAsync(key);
            if(type == 'string'){
                this.map.set(key, await this.client.getAsync(key));
            }else if(type == 'list'){
                this.map.set(key, await this.client.lrangeAsync(key, 0, -1));
            }else if(type == 'hash'){
                this.map.set(key, await this.client.hgetallAsync(key));
            }else if(type == 'set'){
                this.map.set(key, await this.client.smembersAsync(key));
            }else if(type == 'zset'){
                this.map.set(key, await this.client.zrange(key, 0, -1));
            }
        }
        this.nrp = new NRP({
            emitter: this.client,
            receiver: this.subClient,
        })
        this.nrp.on(CONFIG_CHANGED + this.configName, (id) =>{
            if(id != this.id){
                this.init();
            }
        })
    }

    notifyChange(){
        this.nrp.emit(CONFIG_CHANGED + this.configName, this.id)
    }
    /**
     *  获得 value
     *  直接通过内存， 不访问数据库
     * @param key  带前缀
     * @returns {*}
     */
    get(key){
        return this.map.get(key);
    }

    /**
     * 获得value
     * @param mapName
     * @param key 不带前缀
     * @returns {*}
     */
    getMap(mapName, key){
        return this.get('h_' + mapName).get(key);
    }

    getArray(key){
        return this.get('a_' + key);
    }

    getSet(key){
        return this.get('s_' + key);
    }

    getZSet(key){
        return this.get('z_' + key);
    }

    getString(key){
        return this.get('n_' + key);
    }

    /**
     * 将 key 添加到内存， 并在数据库中同步
     * @param key
     * @returns {Promise<void>}
     */
    async _addKey(key){
        this.keys.add(key)
        await this.client.saddAsync(this.configName, key);
        this.notifyChange();
    }

    /**
     * 删除 key, 带有前缀
     * @param key
     * @returns {Promise<void>}
     * @private
     */
    async _delKey(key){
        try{
            this.keys.delete(key);
            await this.client.delAsync(key);
            this.notifyChange();
        }catch (e) {
            redisLog.error('----error', e);
        }

    }
    /***
     * 删除键 不带前缀
     * @param keys
     * @returns {Promise<number>}
     */
    async delMap(key){
        key = 'h_' + key;
        if(!this.map.has(key)){
            this.catchError('error! There is no key of this type with the this name!')
        }else{
            this._delKey(key);
        }
    }

    async delArray(key){
        key = 'a_' + key;
        if(!this.map.has(key)){
            this.catchError('error! There is no key of this type with the this name!')
        }else{
            this._delKey(key);
        }
    }

    async delSet(key){
        key = 's_' + key;
        if(!this.map.has(key)){
            this.catchError('error! There is no key of this type with the this name!')
        }else{
            this._delKey(key);
        }
    }

    async delZSet(key){
        key = 'z_' + key;
        if(!this.map.has(key)){
            this.catchError('error! There is no key of this type with the this name!')
        }else{
            this._delKey(key);
        }
    }
    async delString(key){
        key = 'n_' + key;
        if(!this.map.has(key)){
            this.catchError('error! There is no key of this type with the this name!')
        }else{
            this._delKey(key);
        }
    }

    async setString(key, value){
        key = 'n_' + key;
        if(this.map.has(key)){
            this._delKey(key);
        }
        if(Object.prototype.toString.call(value) === TYPE.STRING){
            this._addKey(key);
            this.map.set(key, value);
            await this.client.set(key, value);
        }
    }
    /**
     * value 为 map 的 Set
     * @param key
     * @param value
     * @returns {Promise<void>}
     */
    async setMap(key, value){
        key = 'h_' + key;
        if(this.map.has(key)){
            this._delKey(key);
        }
        if(Object.prototype.toString.call(value) === TYPE.HASH){
            this._addKey(key);
            this.map.set(key, value);
            for(let element of value){
                await this.client.hsetAsync(key, element[0], element[1]);
            }
        }
    }

    /**
     * value 为 array 的 set
     * @param key
     * @param array
     * @returns {Promise<void>}
     */
    async setArray(key, value){
        key = 'a_' + key;
        if(this.map.has(key)){
            this._delKey(key);
        }
        if(Object.prototype.toString.call(value) === TYPE.LIST){
            this._addKey(key);
            this.map.set(key, value);
            for(let element of value){
                await this.client.rpushAsync(key, element);
            }
        }
    }

    /**
     * value 为 set 的 set
     * @param key
     * @param value
     * @returns {Promise<void>}
     */
    async setSet(key, value){
        key = 's_' + key;
        if(this.map.has(key)){
            this._delKey(key);
        }
        if(Object.prototype.toString.call(value) === TYPE.SET){
            this._addKey(key);
            this.map.set(key, value);
            for(let element of value){
                await this.client.saddAsync(key, element);
            }
        }
    }

    async setZset(key, value){

    }

    /***
     *  将 element 加入到 set
     *  key 必须是 Set type 或者是为空
     * @param key
     * @param element
     * @returns {Promise<void>}
     */
    async addSet(key, elements){
        key = 's_' + key;
        if(Object.prototype.toString.call(elements) == TYPE.LIST){
            for(let element of elements){
                if(!this.map.has(key)){
                    this.map.set(key, new Set());
                    this.map.get(key).add(element);
                    await this.client.saddAsync(key, element);
                }else if(Object.prototype.toString.call(this.map.get(key)) == TYPE.SET){
                    this.map.get(key).add(element);
                    await this.client.saddAsync(key, element);
                }else{
                    this.catchError(`---Err, this key: ${key.substring(2)} is not the array type!`)
                }
                this.notifyChange();
            }
        }else{
            if(!this.map.has(key)){
                this.map.set(key, new Set());
                this.map.get(key).add(elements);
                await this.client.saddAsync(key, elements);
            }else if(Object.prototype.toString.call(this.map.get(key)) == TYPE.LIST){
                this.map.get(key).add(elements);
                await this.client.saddAsync(key, elements);
            }else{
                this.catchError(`---Err, this key: ${key.substring(2)} is not the array type!`)
            }
            this.notifyChange();
        }
    }
    /**
     * 取出随机元素
     * @param key
     * @returns {Promise<void>}
     */
    async popSet(key){
        key = 'a_' + key;
        if(Object.prototype.toString.call(this.map.get(key)) == TYPE.LIST){
            if(this.map.get(key).size > 0){
                let ret = await this.client.spopAsync(key);
                this.map.get(key).delete(ret);
                return ret;
            }else{
                this.catchError(`---Err, List length is 0`);
            }
        }else{
            this.catchError(`---Err, Wrong Type! the type of this key is not List`);
        }
    }

    /***
     *  将 element 插入到 array 头部
     *  key 必须是 array type 或者是为空
     * @param key
     * @param elements
     * @returns {Promise<void>}
     */
    async pushArrayHead(key, elements){
        key = 'a_' + key;
        if(Object.prototype.toString.call(elements) == TYPE.LIST){
            for(let element of elements){
                if(!this.map.has(key)){
                    this.map.set(key, new Array());
                    this.map.get(key).pushHead(element);
                    await this.client.lpushAsync(key, element);
                }else if(Object.prototype.toString.call(this.map.get(key)) == TYPE.LIST){
                    this.map.get(key).pushHead(element);
                    await this.client.lpushAsync(key, element);
                }else{
                    this.catchError(`---Err, this key: ${key.substring(2)} is not the array type!`)
                }
                this.notifyChange();
            }
        }else{
            try{
                if(!this.map.has(key)){
                    this.map.set(key, new Array());
                    this.map.get(key).pushHead(elements);
                    await this.client.lpushAsync(key, elements);
                }else if(Object.prototype.toString.call(this.map.get(key)) == TYPE.LIST){
                    this.map.get(key).pushHead(elements);
                    await this.client.lpushAsync(key, elements);
                }else{
                    this.catchError(`---Err, this key: ${key.substring(2)} is not the array type!`)
                }
                this.notifyChange();
            } catch (e) {
                this.catchError('---Err', e);
            }
        }
    }

    /***
     *  将 element 插入到 array 尾部
     *  key 必须是 array type 或者是为空
     * @param key
     * @param elements
     * @returns {Promise<void>}
     */
    async pushArrayTail(key, elements){
        key = 'a_' + key;
        if(Object.prototype.toString.call(elements) == TYPE.LIST){
            for(let element of elements){
                if(!this.map.has(key)){
                    this.map.set(key, new Array());
                    this.map.get(key).push(element);
                    await this.client.rpushAsync(key, element);
                }else if(Object.prototype.toString.call(this.map.get(key)) == TYPE.LIST){
                    this.map.get(key).push(element);
                    await this.client.rpushAsync(key, element);
                }else{
                    this.catchError(`---Err, this key: ${key.substring(2)} is not the array type!`)
                }
                this.notifyChange();
            }
        }else{
            try{
                if(!this.map.has(key)){
                    this.map.set(key, new Array());
                    this.map.get(key).push(elements);
                    await this.client.rpushAsync(key, elements);
                }else if(Object.prototype.toString.call(this.map.get(key)) == TYPE.LIST){
                    this.map.get(key).push(elements);
                    await this.client.rpushAsync(key, elements);
                }else{
                    this.catchError(`---Err, this key: ${key.substring(2)} is not the array type!`)
                }
                this.notifyChange();
            } catch (e) {
                this.catchError('---Err', e);
            }
        }
    }

    /**
     * 取出队头元素
     * @param key
     * @returns {Promise<void>}
     */
    async popArrayHead(key){
        key = 'a_' + key;
        if(Object.prototype.toString.call(this.map.get(key)) == TYPE.LIST){
            if(this.map.get(key).length > 0){
                await this.client.lpopAsync(key);
                return this.map.get(key).popHead();
            }else{
                this.catchError(`---Err, List length is 0`);
            }
        }else{
            this.catchError(`---Err, Wrong Type! the type of this key is not List`);
        }
    }

    /**
     * 取出队尾元素
     * @param key
     * @returns {Promise<void>}
     */
    async popArrayTail(key){
        key = 'a_' + key;
        let ret;
        if(Object.prototype.toString.call(this.map.get(key)) == TYPE.LIST){
            if(this.map.get(key).length > 0){
                ret = this.map.get(key).pop();
                await this.client.rpopAsync(key);
            }else{
                this.catchError(`---Err, List length is 0`);
            }
        }else{
            this.catchError(`---Err, Wrong Type! the type of this key is not List`);
        }
    }

    /**
     * 捕获异常
     * @param err
     * @param callback
     */
    catchError (err, callback){
        if( 'function' != typeof callback){
            callback = () => {};
        }
        if(err){
            redisLog.error(err);
            callback(err)
        }
    }

    quit (callback){
        if( 'undefined' != typeof callback){
            callback = () => {};
        }
        this.client.quit(callback);
        this.subClient.quit()
    }
}


async function pubReady(){
    return new Promise(((resolve, reject) => {
        if(this.redisAuthor == undefined){
            // do sth
        }else{
            this.client = redis.createClient(this.redisAuthor);
            this.client.on('error', function (err) {
                redisLog.error(err);
                reject(false);
            })
            this.client.on('connect', function () {
                redisLog.info('--connect', this.redisAuthor)
            })
            this.client.on('ready', function () {
                redisLog.info('pub is ready!');
                resolve(true);
            })
        }
    }));
}

async function subReady(){
    return new Promise(((resolve, reject) => {
        if(this.redisAuthor == undefined){
            // do sth
        }else{
            this.subClient = redis.createClient(this.redisAuthor);
            this.subClient.on('error', function (err) {
                redisLog.error(err);
                reject(false);
            })
            this.subClient.on('connect', function () {
                redisLog.info('--connect', this.redisAuthor)
            })
            this.subClient.on('ready', function () {
                redisLog.info('sub is ready!');
                resolve(true);
            })
        }
    }));
}

/**
 * ready 的条件是
 * client 准备好了 //用于查询以及发布消息
 * subClient 准备好了 // 用于监听消息
 * @param self
 * @returns {Promise<*>}
 */
async function ready(){
    let self = this;
    return new Promise( async (resolve, reject) => {
        if(await self.pubReady() && await self.subReady()){
            resolve(true);
        }else{
            reject(false);
        }
    })

}


module.exports = ConfigManger;
async function test(){
    let redisAuthor = {
        port: '6379',
        hots: '127.0.0.1'
    }
    let manager = new ConfigManger(redisAuthor, 'set');
    if(await manager.ready()){
        await manager.init();
        //await manager.delKey('key5');
        await manager.setSet('key5', new Set([1, 3, 5, 3]))
        //await manager.delKey('key6');
        //await manager.setMap('key6', new Map([['key', 'value'], ['name', 5], ['first', 5, 'hi']]))
        logger.info('maps', manager.map);
    }
}

//test()