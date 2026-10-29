# Sound｜城市聲音打孔機 · 獨立網站

此資料夾可單獨發布到 GitHub Pages，不需要原網站的首頁、Visual 或 Space。

保留珠海／澳門切換、24 段城市錄音、音高選擇、打孔、旋律試聽、JPG 和 WAV 下載。寬屏的音高面板位於機器右側，窄屏位於下方，使用統一白色 UI。
「聲音影像」保留原 Bilibili 外鏈；頂部提供返回完整主站的外鏈。

## 發布到 GitHub Pages

請建立新的倉庫，避免覆蓋原 --AA 整站。

1. 在 GitHub 建立 Public 倉庫，例如 sound-atlas。
2. 進入新倉庫，點 Add file → Upload files。
3. 上傳本資料夾裡的全部文件與文件夾，保持原結構。index.html 直接位於倉庫根目錄。
4. Commit changes。
5. Settings → Pages → Deploy from a branch → main → /(root) → Save。
6. 等 Pages 發布成功後，使用頁面提供的網址。

ZIP 需要先解壓，不要把 ZIP 本身當作網站上傳。全部共少於 100 個文件，每個文件小於 25 MiB，可透過網頁上傳。

## 本機開啟

雙擊「啟動網站.command」，瀏覽器會自動開啟；電腦需要 Python 3。
也可在終端機執行 python3 preview.py。
請透過本地 HTTP 服務開啟，避免直接雙擊 index.html 導致音訊或下載出錯。

## 文件

- index.html：獨立首頁。
- styles.css、layout.css、shared/：外觀及適配。
- app.js、city-audio.js、music-roll.js：原互動與聲音程式。
- assets/：全部圖片及 24 段錄音。
- CREDITS.md：原素材說明。

返回主站和聲音影像外鏈需要網路；其他互動資源均包含在此包內。
