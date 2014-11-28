@echo off
REM Following is for expansion of variables at runtime - e.g. !e! instead of %e%
setlocal EnableDelayedExpansion
SET script_folder=%~dp0
cd %script_folder:~0,-1%

FOR /D %%c in ("%APPDATA%\Mozilla\Firefox\Profiles\*.default") DO set p=%%c
if defined p (
    set e="%p%\extensions"
    REM If you have not got any extensions in Firefox profile yet, there is no 'extensions' folder. So create it.
    if not exist "!e!" (
      mkdir "!e!"
    )
    
    REM Now set up the actual extensions, unless they are already installed from XPI    
    REM Do not use: echo %CD%.>target-file. Use: cd >target-file. For some reason %CD% doesn't get updated after I change directory.
    if not exist "!e!\selblocks-global@selite.googlecode.com.xpi" (
      cd src
      cd > "!e!\selblocks-global@selite.googlecode.com"
      cd ..
    )
) else (
   echo Could not find a default Firefox profile
)
