#!/bin/bash

set -e -o pipefail

# run in ./packages/sygna-gateway
PROTO_PATH="../trisa-vasp/proto"
OUT_DIR="./src/generated"
OUT_DIR_DIST="./dist"

mkdir -p $OUT_DIR
mkdir -p $OUT_DIR_DIST

for PROTO_F in $(find $PROTO_PATH -name '*.proto')
do
    echo "Generating $PROTO_F"
    # Generate node code.
    npx grpc_tools_node_protoc \
        --js_out=import_style=commonjs,binary:$OUT_DIR \
        --grpc_out=generate_package_definition:$OUT_DIR \
        -I $PROTO_PATH \
        -I /usr/include \
        $PROTO_F

    # Generate node typescript declaration files.
    npx protoc \
        --plugin=protoc-gen-ts=./node_modules/.bin/protoc-gen-ts \
        --ts_out=generate_package_definition:$OUT_DIR \
        -I $PROTO_PATH \
        -I /usr/include \
        $PROTO_F
    
    # Copy src files to dist
    cp -r $OUT_DIR/ $OUT_DIR_DIST/
done