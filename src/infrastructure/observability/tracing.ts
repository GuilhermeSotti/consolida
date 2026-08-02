type TracingSdk = {
  start: () => void;
  shutdown: () => Promise<void>;
};

function createStubSdk(): TracingSdk {
  return {
    start: () => undefined,
    shutdown: async () => undefined,
  };
}

function initializeTracing() {
  const sdk = createStubSdk();

  sdk.start();

  process.on('SIGTERM', async () => {
    await sdk.shutdown();
  });
}

void initializeTracing();

export {};
