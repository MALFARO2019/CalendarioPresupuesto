const { getAllEventos } = require('./eventos');

async function testEventos() {
    console.log("Calling getAllEventos...");
    const timeout = setTimeout(() => {
        console.error("TIMEOUT!!! getAllEventos hung!");
        process.exit(1);
    }, 5000);
    try {
        const result = await getAllEventos();
        clearTimeout(timeout);
        console.log(`Success! Found ${result.length} eventos`);
        process.exit(0);
    } catch (err) {
        clearTimeout(timeout);
        console.error("Error:", err);
        process.exit(1);
    }
}
testEventos();
