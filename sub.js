const ConfigManager = require('./ConfigManager')

async function test() {
    let redisAuthor = {
        port: '6379',
        hots: '127.0.0.1'
    }
    let config = new ConfigManager(redisAuthor, 'set', new Date().getTime());
    if(await config.ready()){
        await config.init()
        setInterval(()=>{
            console.log(config.map);
        }, 5000)
    }
}

test()