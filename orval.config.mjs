/**
 * @type {import('orval').Config}
 */
const config = {
  api: {
    output: {
      target: 'src/api/endpoints.ts',
      schemas: 'src/api/models',
      client: 'react-query',
      mode: 'single',
      override: {
        mutator: {
          path: './src/api/mutator.ts',
          name: 'customInstance',
        },
      },
    },
    input: {
      target: 'https://tornado2025.chigayuki.com/openapi.json',
    },
  },
};

export default config;
