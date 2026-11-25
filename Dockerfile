# ---- Tahap 1: build binary statis (musl) ----
FROM rust:1-alpine AS build
RUN apk add --no-cache musl-dev
WORKDIR /src
COPY Cargo.toml Cargo.lock* build.rs ./
COPY src ./src
COPY web ./web
RUN cargo build --release

# ---- Tahap 2: image akhir minimal, hanya berisi satu file ----
FROM scratch
COPY --from=build /src/target/release/giganta-exam /giganta-exam
USER 10001:10001
# Render mengisi PORT sendiri; nilai ini hanya bawaan.
ENV PORT=10000
EXPOSE 10000
ENTRYPOINT ["/giganta-exam"]
