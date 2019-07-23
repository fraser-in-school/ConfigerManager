const ConfigManager = require('./ConfigManager')
const log4js = require('log4js')

const redisLog = log4js.configure('conf/log4js.json').getLogger('redis')
const logger = log4js.configure('conf/log4js.json').getLogger()



async function test() {
    let redisAuthor = {
        port: '6379',
        hots: '127.0.0.1'
    }
    let config = new ConfigManager(redisAuthor, 'set', new Date().getTime());
    if(await config.ready()){
        await config.init()
        //await manager.delKey('key5');
        await config.setSet('set', new Set([1, 3, 5, 3]))
        //await manager.delKey('key6');
        await config.setMap('map', new Map([['key', 'value'], ['name', 5], ['first', 5]]))

        await config.setArray('array', new Array(1, 3, 5, 5));

        await config.setString('string', 'it is string');

        await config.pushArrayTail('array', [7, 8, 9]);

        await config.pushArrayHead('array', 0)

        await logger.info('arr', config.getArray('array'))

        await config.addSet('set', 7, 8, 9)

        await config.popSet('set')

        logger.info('set', config.getSet('set'))

        await logger.info('map', await config.popArrayHead('array'))

        await logger.info(config.map)

        config.quit()
    }

}

test()