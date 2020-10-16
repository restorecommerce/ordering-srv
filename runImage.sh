#!/bin/bash
docker run \
 --name ordering-srv \
 --hostname ordering-srv \
 --network=system_restorecommerce \
 -e NODE_ENV=production \
 -p 50051:50051 \
 restorecommerce/ordering-srv

