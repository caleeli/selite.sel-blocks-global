#!/bin/bash
#change dir to where this script is run from:
cd "$( dirname "${BASH_SOURCE[0]}" )"

cd src

# TODO: Make this script accept an optional parameter, which is a name of Firefox profile`
HOME_FOLDER=~

if [ "$(uname)" == "Darwin" ]; then
   # According to http://kb.mozillazine.org/Profile_folder_-_Firefox  there are two places for Firefox profile folder on Mac OS:
   # ~/Library/Mozilla/Firefox/Profiles/<profile folder> or ~/Library/Application Support/Firefox/Profiles/<profile folder> 
   # But on Mac OS 10.5.8 I could see the second folder only. If you can test both, please update this/send this to me.
   # Anyway, I don't know how to escape this for now, so if you know, fix this.
   EXTENSION_FOLDER=$HOME_FOLDER/"'Application Support/Firefox/Profiles/*.default'"
else
   EXTENSION_FOLDER="$HOME_FOLDER/.mozilla/firefox/*.default"
fi
EXTENSION_FOLDER=`echo $EXTENSION_FOLDER`/extensions

# If you haven't got any extensions in Firefox profile yet, there is no 'extensions' folder. So create it.
if [ ! -e $EXTENSION_FOLDER ]
then
  mkdir $EXTENSION_FOLDER
fi

if [ ! -e $EXTENSION_FOLDER/selblocks-global\@selite.googlecode.com.xpi ]
then
  pwd > $EXTENSION_FOLDER/selblocks-global@selite.googlecode.com
fi

