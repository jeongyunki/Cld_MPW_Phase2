# 전달받은 텍스트를 Windows 내장 음성(SAPI)으로 읽어 주는 스크립트
# 사용법: powershell -File .claude/speak.ps1 "읽을 문장"
param(
	[string]$Text = '작업이 완료되었습니다.'
)

Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
# 기본 음성이 영어(Zira)일 수 있으므로 한국어 음성(Heami)을 명시
$synth.SelectVoice('Microsoft Heami Desktop')
$synth.Speak($Text)
$synth.Dispose()
