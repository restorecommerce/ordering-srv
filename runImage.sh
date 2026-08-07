#!/bin/bash
export PROJECT_PREFIX=${PROJECT_PREFIX:-docker}

docker run \
 --name ordering-srv \
 --hostname ordering-srv \
 --network='${"$1":-PROJECT_PREFIX}'_restorecommerce \
 -e NODE_ENV=production \
 -p 50051:50051 \
 restorecommerce/ordering-srv

