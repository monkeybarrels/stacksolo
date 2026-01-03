import type { RequestHandler } from './$types';
import { streamCLI } from '$lib/cli';

export const GET: RequestHandler = async () => {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let progress = 0;

      const abort = streamCLI(
        ['deploy'],
        (line, type) => {
          // Determine log level based on content
          let level: 'info' | 'success' | 'warning' | 'error' = 'info';
          const lowerLine = line.toLowerCase();

          if (lowerLine.includes('error') || lowerLine.includes('failed')) {
            level = 'error';
          } else if (lowerLine.includes('warning') || lowerLine.includes('warn')) {
            level = 'warning';
          } else if (lowerLine.includes('success') || lowerLine.includes('complete') || lowerLine.includes('created')) {
            level = 'success';
          }

          // Send log line
          const data = JSON.stringify({
            type: 'log',
            message: line,
            level,
            stream: type,
          });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));

          // Update progress based on log content
          if (lowerLine.includes('initializing')) progress = 10;
          else if (lowerLine.includes('planning')) progress = 30;
          else if (lowerLine.includes('applying')) progress = 50;
          else if (lowerLine.includes('creating')) progress = 70;
          else if (lowerLine.includes('complete')) progress = 90;

          if (progress > 0) {
            const progressData = JSON.stringify({ type: 'progress', progress });
            controller.enqueue(encoder.encode(`data: ${progressData}\n\n`));
          }
        },
        (exitCode) => {
          const completeData = JSON.stringify({
            type: 'complete',
            success: exitCode === 0,
            exitCode,
          });
          controller.enqueue(encoder.encode(`data: ${completeData}\n\n`));
          controller.close();
        }
      );

      // Handle stream cancellation
      return () => {
        abort();
      };
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
};
