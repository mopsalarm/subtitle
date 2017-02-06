FROM alpine:3.4

RUN apk --no-cache add ffmpeg ca-certificates \
 && rm /usr/bin/ffplay /usr/bin/ffserver

EXPOSE 8000
VOLUME /app/temp

WORKDIR /app/
COPY frontend/ /app/frontend/
COPY s0btitle /app/

ENTRYPOINT ["/app/s0btitle"]
