@echo off
rem Starts Winner League Arcade and opens it in the browser.
rem With Node.js installed it runs the full server (including Online 1v1);
rem otherwise it falls back to the Python server (single-player games only).
rem Keep this window open while playing; close it to stop the server.
cd /d "%~dp0"
set WLA_PORT=5173

where node >nul 2>nul
if errorlevel 1 goto python

if not exist node_modules\ws (
  echo Installing the online server's one dependency, first run only...
  call npm install --omit=dev --no-audit --no-fund
)
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start "" http://localhost:%WLA_PORT%/game/"
echo Winner League Arcade (with Online 1v1) is running at http://localhost:%WLA_PORT%/game/
echo Close this window to stop it.
node server\index.js %WLA_PORT%
pause
exit /b

:python
rem Pick a Python: the "py" launcher, else "python".
set PY=
where py >nul 2>nul && set PY=py -3
if not defined PY where python >nul 2>nul && set PY=python
if not defined PY (
  echo Neither Node.js nor Python was found.
  echo Install Node.js from https://nodejs.org/ to play, including Online 1v1, and try again.
  pause
  exit /b 1
)
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start "" http://localhost:%WLA_PORT%/game/"
echo Winner League Arcade is running at http://localhost:%WLA_PORT%/game/
echo Online 1v1 needs Node.js: install it from https://nodejs.org/ and run this file again.
echo Close this window to stop it.
%PY% game\tools\serve.py %WLA_PORT%
pause
