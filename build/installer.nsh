; Modern NSIS look: dark inner pages + Encryptic sidebar (164×314 BMP).
; Bitmap path must be absolute — NSIS does not resolve our filename against build/.

!ifdef MUI_WELCOMEFINISHPAGE_BITMAP
  !undef MUI_WELCOMEFINISHPAGE_BITMAP
!endif
!define MUI_WELCOMEFINISHPAGE_BITMAP "${BUILD_RESOURCES_DIR}\nsis-welcome-164x314.bmp"

!ifdef MUI_UNWELCOMEFINISHPAGE_BITMAP
  !undef MUI_UNWELCOMEFINISHPAGE_BITMAP
!endif
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "${BUILD_RESOURCES_DIR}\nsis-welcome-164x314.bmp"

!ifdef MUI_BGCOLOR
  !undef MUI_BGCOLOR
!endif
!define MUI_BGCOLOR 05050C

!ifdef MUI_TEXTCOLOR
  !undef MUI_TEXTCOLOR
!endif
!define MUI_TEXTCOLOR F0F0F5

!ifdef MUI_BRANDINGTEXT
  !undef MUI_BRANDINGTEXT
!endif
!define MUI_BRANDINGTEXT "Encryptic IDE · Windows 10 / 11 installer"

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Install Encryptic IDE"
  !define MUI_WELCOMEPAGE_TEXT "This installer is for Microsoft Windows 10 or Windows 11.$\n$\nThis .exe is the Windows setup only.$\n$\nOther platforms from the same release:$\n$\n  • Linux — AppImage or .deb$\n  • macOS — .dmg$\n$\nChoose Next to pick an install folder (if shown), then finish."
  !insertmacro MUI_PAGE_WELCOME
  !undef MUI_WELCOMEPAGE_TITLE
  !undef MUI_WELCOMEPAGE_TEXT
!macroend
