# OhMyShokz

개인용 macOS 앱 MVP입니다.

- YouTube 링크 입력
- 앱에서 영상 미리보기
- 플레이어 현재 시각으로 시작/종료 시간 자동 입력
- 시작/종료 시간 지정 후 MP3 생성
- 저장 폴더 지정
- `/Volumes` 기준 Shokz 후보 자동 탐지
- 다운로드 파일 목록 + 전송 상태 표시
- 파일별 원클릭 기기 복사

## Local Run

필수:

- Node.js 20+

```bash
npm install
npm start
```

도구 설치:

- `ffmpeg`는 앱에 포함됩니다.
- `yt-dlp`는 앱에서 `도구 자동 설치` 버튼으로 설치됩니다.

## MP3 구간 추출

- 시간 형식: `HH:MM:SS` 또는 `MM:SS`
- 시작/종료 둘 다 입력하면 해당 구간만 MP3로 생성
- 둘 다 비우면 전체 길이 기준으로 MP3 생성
- `현재 시각을 시작으로`, `현재 시각을 종료로` 버튼으로 플레이어 위치를 바로 입력 가능

## 기기 전송

- 앱이 `/Volumes`의 디스크 이름에서 `shokz/swim/openswim` 키워드로 자동 후보를 보여줍니다.
- 필요하면 `직접 선택`으로 기기 폴더를 수동 지정할 수 있습니다.
- 파일 목록의 `기기로 복사` 버튼으로 선택한 기기 폴더에 MP3를 복사합니다.

## GitHub Actions (DMG)

워크플로 파일: `.github/workflows/build-dmg.yml`

- 수동 실행: `Actions > Build DMG > Run workflow`
- 태그 푸시: `git tag v0.1.0 && git push origin v0.1.0`

결과:

- Action artifacts에 `OhMyShokz-dmg` 업로드
- 태그 빌드면 Release assets에도 `.dmg` 첨부

## Notes

- 이 앱은 YouTube 콘텐츠를 자동 저장하므로, 본인 권리/라이선스가 있는 콘텐츠만 사용하세요.
- Shokz 기기마다 파일 복사 방식이 다를 수 있습니다. OpenSwim 계열은 USB 저장소 복사 방식이 일반적입니다.
