const functions = require('@google-cloud/functions-framework');

functions.http('api', (req, res) => {
  res.json({
    message: 'Hello from Kubernetes!',
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
  });
});

// Health check endpoint
functions.http('health', (req, res) => {
  res.status(200).send('OK');
});
