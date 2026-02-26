const API_BASE = 'https://voice-ai-mini-agent.vercel.app';
const TENANT_ID = '00000000-0000-0000-0000-000000000001';

async function testLiveAudioRoute() {
    console.log(`Starting Live Audio test for tenant: ${TENANT_ID}\n`);

    try {
        console.log('1. Joining a Live Session...');
        const joinRes = await fetch(`${API_BASE}/live/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tenantId: TENANT_ID,
                participantName: 'Test CLI',
                roomName: 'test-room-1'
            })
        });

        if (!joinRes.ok) {
            console.error('Failed to join:', await joinRes.text());
            return;
        }

        const joinData = await joinRes.json();
        const sessionId = joinData.sessionId;
        console.log(`✅ Session Created: ${sessionId}`);
        console.log(`   Room: ${joinData.room}`);
        console.log(`   Token: ${joinData.token.substring(0, 20)}...`);

        await new Promise(r => setTimeout(r, 2000));

        console.log('\n2. Fetching runner status...');
        const statusRes = await fetch(`${API_BASE}/live/status/${sessionId}`);
        const statusData = await statusRes.json();
        console.log(`✅ Status:`, statusData);

        console.log('\n3. Simulating audio upload (fallback)...');
        const dummyAudio = Buffer.alloc(16000 * 2);
        const audioBase64 = dummyAudio.toString('base64');

        const audioRes = await fetch(`${API_BASE}/live/audio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tenantId: TENANT_ID,
                sessionId,
                audioBase64
            })
        });

        const audioData = await audioRes.json();
        console.log('✅ Audio POST result:', audioData);

        console.log('\n4. Cleaning up (Leaving session)...');
        const leaveRes = await fetch(`${API_BASE}/live/leave`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId })
        });
        console.log('✅ Cleanup result:', await leaveRes.json());

    } catch (err) {
        console.error('Test script failed:', err);
    }
}

testLiveAudioRoute();
