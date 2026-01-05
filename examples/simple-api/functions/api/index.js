import functions from '@google-cloud/functions-framework';

functions.http('api', (req, res) => {
  const response = {
    message: 'Hello from StackSolo!',
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
  };

  res.json(response);
});
