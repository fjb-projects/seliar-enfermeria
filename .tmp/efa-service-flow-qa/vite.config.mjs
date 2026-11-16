import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import path from 'node:path';
export default defineConfig({root:'.tmp/efa-service-flow-qa',envDir:'.tmp/efa-service-flow-qa/no-env',plugins:[react(),tailwind()],resolve:{alias:{'@':path.resolve('src')}},server:{host:'127.0.0.1',port:4187,strictPort:true}});
