require('dotenv').config({ override: true });
const formsService = require('./services/formsService');

async function testSync() {
    try {
        console.log('🔄 Testing Forms API - getting form details and responses...\n');

        const formId = 'bgTfcEXlx0SujCHFMnLubn0pfVm_PqVOptiibVeuAUtUNFlZNjRPV1dZWlRUQUVYMUo2REkwSDUzVi4u';

        // Get form details
        console.log('📋 Getting form details...');
        const details = await formsService.getFormDetails(formId);
        console.log('Form title:', details.title || details.displayName || JSON.stringify(details).substring(0, 200));

        // Get responses (limit to first few)
        console.log('\n📊 Getting responses...');
        const responses = await formsService.getFormResponses(formId);
        console.log(`Total responses: ${responses.length}`);

        if (responses.length > 0) {
            console.log('\n🔍 First response structure:');
            console.log(JSON.stringify(responses[0], null, 2).substring(0, 2000));

            if (responses.length > 1) {
                console.log('\n🔍 Second response (answers only):');
                console.log(JSON.stringify(responses[1]?.answers, null, 2)?.substring(0, 1000));
            }
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

testSync();
