FROM oven/bun:1.3.9-debian

RUN useradd --create-home --shell /usr/sbin/nologin sandbox

WORKDIR /workspace
USER sandbox

ENV CI=true
ENV NO_COLOR=1
