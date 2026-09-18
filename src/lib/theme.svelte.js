/**
 * 다크/라이트 모드 상태. +layout.svelte의 토글 스위치가 이 값을 바꾸고,
 * +layout.svelte가 그 값을 document.documentElement의 class로 반영해서
 * 모든 페이지의 CSS 변수(--bg-page 등)가 한꺼번에 바뀌게 한다.
 */
export const theme = $state({ mode: 'dark' }); // 'dark' | 'light'

export function toggleTheme() {
  theme.mode = theme.mode === 'dark' ? 'light' : 'dark';
}
