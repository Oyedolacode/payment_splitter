
const { Client } = require('pg');

async function testConnection(name, connectionString) {
    const client = new Client({ connectionString });
    console.log(`\n--- Testing: ${name} ---`);
    console.log(`URL: ${connectionString.replace(/:[^:@]+@/, ':****@')}`);
    try {
        await client.connect();
        console.log(`[${name}] SUCCESS: Connected!`);
        const res = await client.query('SELECT NOW()');
        console.log(`[${name}] Query result:`, res.rows[0]);
        await client.end();
    } catch (err) {
        console.error(`[${name}] FAILED:`, err.message);
        if (err.code) console.error(`Error Code: ${err.code}`);
    }
}

async function runTests() {
    const pass = "I71Grn4eWhIVsH46";
    const project = "hawghpeiphwoujcqpqio";
    const host = "aws-1-eu-central-1.pooler.supabase.com";

    await testConnection("DIRECT (5432) - Standard", `postgresql://postgres.${project}:${pass}@${host}:5432/postgres`);
    await testConnection("DIRECT (5432) - SSL Require", `postgresql://postgres.${project}:${pass}@${host}:5432/postgres?sslmode=require`);
    await testConnection("POOLER (6543) - Standard", `postgresql://postgres.${project}:${pass}@${host}:6543/postgres`);
    await testConnection("POOLER (6543) - Pgbouncer", `postgresql://postgres.${project}:${pass}@${host}:6543/postgres?pgbouncer=true`);
}

runTests();
