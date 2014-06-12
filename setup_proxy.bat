@echo off
for /f "tokens=*" %%a in ('dir  %APPDATA%\Mozilla\Firefox\Profiles\*.default /b') do set p=%APPDATA%\Mozilla\Firefox\Profiles\%%a
if defined p (
    set e="%p%\extensions"
    REM If you have not got any extensions in Firefox profile yet, there is no 'extensions' folder. So create it.
    if not exist %e% (
      mkdir %e%
    )
    
    REM Now set up the actual extensions, unless they are already installed from XPI    
    REM Do not use: echo %CD%.>target-file. Use: cd >target-file. For some reason %CD% doesn't get updated after I change directory.
    if not exist %e%\selblocks-global@selite.googlecode.com.xpi (
      cd src
      cd > %e%\selblocks-global@selite.googlecode.com
      cd ..\..
    )

) else (
   echo Could not find a default Firefox profile
)