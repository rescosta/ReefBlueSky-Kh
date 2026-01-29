idf_component_register(
    SRCS
        "main.c"
        "api/DisplayClient.c"
        "api/SetupServer.c"
        "api/JWTHandler.c"
        "led/LEDController.c"
        "storage/NVSStorage.c"
        "states/StateMachine.c"
        "wifi/AccessPoint.c"
        "wifi/WiFiManager.c"
        "../lib/captdns/captdns.c"

        # FIRMWARE VERSION (C++)
        "version/FwVersion.cpp"

        # OTA
        "ota/LcdOta.c"

        # Display / LVGL
        "display/display_simple.cpp"
        "display/LVGLSetup.cpp"
        "display/Themes.cpp"
        "display/display_driver.cpp"

        # UI gerada pelo SquareLine (todos ficam em src/display)
        "display/ui.c"
        "display/ui_helpers.c"
        "display/ui_comp_hook.c"
        "display/ui_Screen1.c"

        # FONTES - ADICIONE ESSAS 5 LINHAS
        "display/assets/montserrat_24.c"
        "display/assets/montserrat_bold_32.c"
        "display/assets/montserrat_number_bold_48.c"
        "display/assets/montserrat_semibold_24.c"
        "display/assets/montserrat_semibold_28.c"

    INCLUDE_DIRS
        "."
        "api"
        "led"
        "storage"
        "states"
        "wifi"
        "display"
        "display/assets" 
        "../lib/captdns"
        "version"
        "ota"

)
