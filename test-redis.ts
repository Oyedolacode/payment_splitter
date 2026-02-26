import Redis from 'ioredis';

const redis = new Redis("rediss://default:AYXwAAIncDExMDY2MmQyYWVmMzk0MzU0YjcwNjVmNjI5MGM5NmE3OXAxMzQyODg@precise-antelope-34288.upstash.io:6379");

async function test() {
    try {
        console.log('Testing Redis...');
        await redis.set('test', 'ok');
        const val = await redis.get('test');
        console.log('Redis success:', val);
    } catch (err) {
        console.error('Redis failed:', err);
    } finally {
        process.exit(0);
    }
}

test();
