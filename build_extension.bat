@echo off
REM Before invoking this script, run 'cd <folder where this script is>'

REM Create folder "xpi", if it doesn't exist already
mkdir xpi
del xpi\*.xpi

cd src
jar cfM ..\xpi\sel-blocks-global.xpi *

cd ..