import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import KoaPinoLogger from 'koa-pino-logger';
import Router from 'koa-router';
import KnexStore from 'koa-generic-session-knex';
import userAgent from 'koa-useragent';
import etag from 'koa-etag';
import cors from '@koa/cors';
import proxy from 'koa-proxies';


import config from './config';
// import compress from './middlewares/compress';
import errorHandler from './middlewares/errorHandler';
import db from './db';
import logger from './logger';
import { verify as verifyJwt } from './jwt';
import verifyTracking, { getTrackingId, setTrackingId } from './tracking';

import health from './routes/health';
import sources from './routes/sources';
import posts from './routes/posts';
import publications from './routes/publications';
import download from './routes/download';
import tweet from './routes/tweet';
import users from './routes/users';
import auth from './routes/auth';
import settings from './routes/settings';
import feeds from './routes/feeds';
import notifications from './routes/notifications';
import tags from './routes/tags';

const app = new Koa();

app.keys = [config.cookies.secret];

app.proxy = config.env === 'production';

// TODO: disabled due to performance issues
// app.use(compress());

const allowedOrigins = config.cors.origin.split(',');

app.use(cors({
  credentials: true,
  origin(ctx) {
    const requestOrigin = ctx.get('Origin');
    if (allowedOrigins.filter(origin => requestOrigin.indexOf(origin) > -1).length) {
      return requestOrigin;
    }
    return false;
  },
}));
app.use(bodyParser());
app.use(KoaPinoLogger({ logger, useLevel: 'debug' }));
app.use(errorHandler());
app.use(verifyJwt);
app.use(userAgent);
app.use(etag());

/* migrate legacy cookies */
const legacyStore = new KnexStore(db, { tableName: 'sessions', sync: true });
app.use(async (ctx, next) => {
  const newCookie = getTrackingId(ctx);
  if (!newCookie || !newCookie.length) {
    const legacyCookie = ctx.cookies.get('da', { signed: true });
    if (legacyCookie && legacyCookie.length) {
      const s = await legacyStore.get(legacyCookie);
      if (s) {
        setTrackingId(ctx, s.userId);
        await legacyStore.destroy(legacyCookie);
        ctx.log.info(`migrated cookie of ${s.userId}`);
      }
      ctx.cookies.set('da');
      ctx.cookies.set('da.sig');
    }
  }
  return next();
});

app.use(verifyTracking);

const router = new Router({
  prefix: '/v1',
});

router.use(feeds.routes(), feeds.allowedMethods());
router.use(sources.routes(), sources.allowedMethods());
router.use(posts.routes(), posts.allowedMethods());
router.use(publications.routes(), publications.allowedMethods());
router.use(tweet.routes(), tweet.allowedMethods());
router.use(users.routes(), users.allowedMethods());
router.use(auth.routes(), auth.allowedMethods());
router.use(settings.routes(), settings.allowedMethods());
router.use(notifications.routes(), notifications.allowedMethods());
router.use(tags.routes(), tags.allowedMethods());

app.use(router.routes(), router.allowedMethods());
app.use(download.routes(), download.allowedMethods());
app.use(health.routes(), health.allowedMethods());

app.use(proxy('/r', {
  target: config.redirectorUrl,
  changeOrigin: true,
  xfwd: true,
}));

app.use(proxy('/v1/a', {
  target: config.monetizationUrl,
  changeOrigin: true,
  xfwd: true,
  rewrite: path => path.substr('/v1'.length),
}));

app.use(proxy('/icon', {
  target: config.besticonUrl,
  changeOrigin: true,
  xfwd: true,
}));
app.use(proxy('/lettericons', {
  target: config.besticonUrl,
  changeOrigin: true,
  xfwd: true,
}));

export default app;
