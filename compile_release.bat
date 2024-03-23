@echo off
setlocal EnableDelayedExpansion

REM Define excluded folder and file names
set "excluded_folders=.git .idea .vscode"
set "excluded_files=.gitignore .prettierrc compile_release.bat manifest.json manifest_chrome.json manifest_firefox.json VH_release_chrome.zip VH_release_firefox.zip"

rmdir /s /q tmp_build
mkdir tmp_build


REM Iterate through folders and files
for %%i in (*) do (
    set "matched=0"
    
    for %%f in (%excluded_files%) do (
        if "%%~nxi"=="%%f" (
            set "matched=1"
        )
    )
    REM Echo the folder or file if it doesn't match excluded names
    if "!matched!"=="0" (
		xcopy /i "%%i" "tmp_build\"
	)
)

for /d %%i in (*) do (
	set "matched=0"
	REM Check if the folder or file matches excluded names
    for %%f in (%excluded_folders%) do (
        if "%%~nxi"=="%%f" (
            set "matched=1"
        )
    )
	
	if "!matched!"=="0" (
		xcopy /s /e /i %%i tmp_build\%%i
	)
)




cd tmp_build

xcopy /i ..\manifest_chrome.json .\
ren manifest_chrome.json manifest.json
"c:\Program Files\WinRAR\WinRAR.exe" a -ep1 -r VH_release_chrome.zip *
del ..\VH_release_chrome.zip
move VH_release_chrome.zip ..\VH_release_chrome.zip
del manifest.json


cd tmp_build
xcopy /i ..\manifest_firefox.json .\
ren manifest_firefox.json manifest.json
"c:\Program Files\WinRAR\WinRAR.exe" a -ep1 -r VH_release_firefox.zip *
del ..\VH_release_firefox.zip
move VH_release_firefox.zip ..\VH_release_firefox.zip

cd ..
rmdir /s /q tmp_build



endlocal