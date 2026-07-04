# Dev container: Vite dev server with HMR.
# (A production nginx static-build stage can be added later using nginx.conf.)
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --force

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
