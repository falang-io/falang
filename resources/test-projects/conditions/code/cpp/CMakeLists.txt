cmake_minimum_required(VERSION 2.8) # Проверка версии CMake.
				    # Если версия установленой программы
				    # старее указаной, произайдёт аварийный выход.

project(falang_bin)

#include_directories(src)
#include_directories(src/falang)
#add_library(foo src/falang/falang_global.cpp)
#add_library(main_lib STATIC src/falang/falang_global.cpp)
#target_include_directories(main_lib PUBLIC ${PROJECT_SOURCE_DIR}/src/falang)

include_directories(src/falang)
add_executable(main src/main.cpp)		# Создает исполняемый файл с именем main#
#target_link_libraries(main foo)	
add_subdirectory(src/falang)
target_link_libraries(main
    PRIVATE 
        falang
)

#src/falang/main.cpp src/falang/calculateMonteCarlo.cpp
				    # из исходника main.cpp