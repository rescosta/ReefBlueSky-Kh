from os.path import join
import shutil
import os

Import("env")

FW_NAME = "RBS_LCD_260123XX.bin"

def after_build(source, target, env):
    build_dir = env.subst("$BUILD_DIR")
    src = join(build_dir, "firmware.bin")

    dst_dir = "/Users/renedesiqueiracosta/Desktop/ReefBlueSky_KH/v7 - com dosadora/backend rev03/firmware/LCD"
    os.makedirs(dst_dir, exist_ok=True)

    dst = join(dst_dir, FW_NAME)

    print("COPIANDO FW:", src, "->", dst)
    shutil.copyfile(src, dst)

env.AddPostAction("buildprog", after_build)
