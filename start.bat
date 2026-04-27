@echo off
chcp 65001 >nul
echo.
echo  ===================================
echo    ChatFlow - יש לי זכות
echo    מתקין ומפעיל את המערכת...
echo  ===================================
echo.

cd /d "%~dp0"

echo [1/3] מתקין חבילות Python...
cd backend
pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo שגיאה בהתקנת חבילות Python!
    pause
    exit /b 1
)

echo [2/3] מתקין חבילות Node.js...
cd ..\frontend
call npm install --silent
if errorlevel 1 (
    echo שגיאה בהתקנת חבילות Node.js!
    pause
    exit /b 1
)

echo [3/3] מפעיל שרתים...
echo.
echo  ===================================
echo    המערכת עולה!
echo    פתח בדפדפן: http://localhost:3000
echo    כניסה: admin / admin123
echo  ===================================
echo.

cd ..\backend
start "ChatFlow Backend" cmd /c "python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 3 /nobreak >nul

cd ..\frontend
start "ChatFlow Frontend" cmd /c "npm run dev"

echo.
echo השרתים רצים! אל תסגור את החלונות שנפתחו.
echo לחץ על כל מקש לסגירת חלון זה (השרתים ימשיכו לרוץ).
pause >nul
