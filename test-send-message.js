const url = 'https://whs.taptapp.xyz/messages/send';
const headers = {
  'Content-Type': 'application/json',
  'x-session-id': '77068552-3d9d-4858-9a01-2d9ddcaaf3ec'
};
const body = JSON.stringify({
  "jid": "912519452",
  "message": {
    "text": "Hola"
  }
});

async function testCurl() {
  console.log('Realizando petición POST a /messages/send...');
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: body
    });

    const data = await response.json();
    console.log('Status Code:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testCurl();
