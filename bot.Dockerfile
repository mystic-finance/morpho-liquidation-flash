FROM node:14 as builder

COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile

COPY . .

RUN yarn build:bot

COPY package.json ./build

FROM public.ecr.aws/lambda/nodejs:14 as runner

COPY --from=builder ./build .
COPY --from=builder ./node_modules ./node_modules
COPY --from=builder ./abis ./abis
CMD ["src/handlers/botHandler.handler"]
