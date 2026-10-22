@echo off
rem Creates a "Black Forest Racing" shortcut on your desktop pointing at this folder's exe.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\Black Forest Racing.lnk');$s.TargetPath='%~dp0Black Forest Racing.exe';$s.WorkingDirectory='%~dp0';$s.Save()"
echo Shortcut created on your desktop.
pause
