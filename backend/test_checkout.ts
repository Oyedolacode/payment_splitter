
async function test() {
    const res = await fetch('http://localhost:3001/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmId: '62c916d8-7b0e-478a-adcd-a6d5f9dff6a5' })
    })
    console.log('Status:', res.status)
    console.log('Body:', await res.text())
}
test()
