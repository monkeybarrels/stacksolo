import functions from '@google-cloud/functions-framework';

functions.http('handler', (req, res) => {
  res.json({
    message: 'Hello from StackSolo API!',
    timestamp: new Date().toISOString(),
    env: {
      firestore: process.env.FIRESTORE_EMULATOR_HOST,
      auth: process.env.FIREBASE_AUTH_EMULATOR_HOST,
      pubsub: process.env.PUBSUB_EMULATOR_HOST,
    },
  });
});
