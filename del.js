const ConfigManager = require('./ConfigManager')
const log4js = require('log4js')

const redisLog = log4js.configure('conf/log4js.json').getLogger('redis')
const logger = log4js.configure('conf/log4js.json').getLogger()
let redisAuthor = {
    port: '6379',
    hots: '127.0.0.1'
}
let config = new ConfigManager(redisAuthor, 'set', new Date().getTime());

async function test() {
    if(await config.ready()){
        await config.init()
        //await manager.delKey('key5');
        await config.delSet('set')
        //await manager.delKey('key6');
        await config.delMap('map')

        await config.delArray('array');

        await config.delString('string');

        await config._delKey('set');
        config.quit()
    }
}

test()
