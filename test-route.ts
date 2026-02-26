async function test() {
    const res = await fetch('http://localhost:3001/auth/firms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Firm' })
    });
    console.log(res.status);
    console.log(await res.json());
}
test();
