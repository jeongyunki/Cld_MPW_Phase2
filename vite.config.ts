import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
			// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
			// See https://svelte.dev/docs/kit/adapters for more information about adapters.
			adapter: adapter()
		})
	],
	// SSR(Node)에서 xlsx를 CommonJS로 불러오면 `import { CFB } from 'xlsx'`가 안 잡힌다.
	// 브라우저·Vitest처럼 ESM 판(xlsx.mjs)을 번들에 넣어 쓰게 한다 (src/lib/xlsxImage.js)
	ssr: { noExternal: ['xlsx'] },
	// Vitest가 이 파일을 그대로 읽어 같은 플러그인/env 설정으로 테스트를 돌린다
	test: {
		include: ['src/**/*.test.js'],
		environment: 'node',
		coverage: {
			provider: 'v8',
			reporter: ['text'],
			include: [
				'src/lib/api/**/*.js',
				'src/lib/imgagongRow.js',
				'src/lib/masterItem.js',
				'src/lib/deliverableRow.js',
				'src/lib/xlsxToText.js',
				'src/lib/xlsxImage.js'
			],
			exclude: ['src/**/*.test.js'],
			thresholds: { lines: 80, branches: 80, functions: 80 }
		}
	}
});
