// x-actions.mjs — X actions (v1.3) [fix 404 opId rediscover + intent URL + seeds discovery]
import assert from 'node:assert/strict';

function firstNonEmpty(...vals){ for (const v of vals) if (v!=null && String(v).trim()!=='') return v; }

function parseTweetIdFromUrl(u) {
  if (!u) return undefined;
  try {
    const url = new URL(u);
    const host = url.hostname.replace(/^www\./,'');
    if (!/(^x\.com$|^twitter\.com$|^mobile\.twitter\.com$)/i.test(host)) return undefined;

    // handle intent links: /intent/retweet?tweet_id=...
    const path = url.pathname.replace(/\/+/g,'/').toLowerCase();
    const qid = url.searchParams.get('tweet_id');
    if (path.startsWith('/intent/') && qid && /^\d+$/.test(qid)) return qid;

    const parts = url.pathname.split('/').filter(Boolean);
    const idx = parts.findIndex(p => /^status(es)?$/i.test(p) || p.toLowerCase()==='i');
    // cover /i/status/ID
    if (idx >= 0) {
      const candidate = parts[idx+1]?.split('?')[0];
      if (candidate && /^\d+$/.test(candidate)) return candidate;
    }
    // generic fallback: scan any numeric segment
    for (const p of parts) if (/^\d+$/.test(p)) return p;
  } catch {}
  return undefined;
}

function parseScreenFromUrl(u) {
  if (!u) return undefined;
  try {
    const url = new URL(u);
    const host = url.hostname.replace(/^www\./,'');
    if (!/(^x\.com$|^twitter\.com$|^mobile\.twitter\.com$)/i.test(host)) return undefined;
    const parts = url.pathname.split('/').filter(Boolean);
    const handle = parts[0];
    if (handle && !/^(home|i|intent)$/i.test(handle)) return handle;
  } catch {}
  return undefined;
}

// === preset fitur & toggles ===
function featuresPreset() {
  return {
    articles_preview_enabled: true,
    c9s_tweet_anatomy_moderator_badge_enabled: true,
    communities_web_enable_tweet_community_results_fetch: true,
    creator_subscriptions_quote_tweet_preview_enabled: true,
    freedom_of_speech_not_reach_fetch_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    longform_notetweets_consumption_enabled: true,
    longform_notetweets_inline_media_enabled: true,
    longform_notetweets_rich_text_read_enabled: true,
    payments_enabled: true,
    premium_content_api_read_enabled: true,
    profile_label_improvements_pcf_label_in_post_enabled: true,
    rweb_tipjar_consumption_enabled: true,
    responsive_web_edit_tweet_api_enabled: true,
    responsive_web_enhance_cards_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: true,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_grok_analysis_button_from_backend: true,
    responsive_web_grok_analyze_button_fetch_trends_enabled: true,
    responsive_web_grok_analyze_post_followups_enabled: true,
    responsive_web_grok_community_note_auto_translation_is_enabled: true,
    responsive_web_grok_image_annotation_enabled: true,
    responsive_web_grok_imagine_annotation_enabled: true,
    responsive_web_grok_share_attachment_enabled: true,
    responsive_web_grok_show_grok_translated_post: true,
    responsive_web_jetfuel_frame: true,
    responsive_web_profile_redirect_enabled: true,
    responsive_web_twitter_article_tweet_consumption_enabled: true,
    standardized_nudges_misinfo: true,
    tweet_awards_web_tipping_enabled: true,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
    verified_phone_label_enabled: true,
    view_counts_everywhere_api_enabled: true,
  };
}
function fieldTogglesPreset() { return { withArticleRichContentState: false }; }

export class XActions {
  constructor(binder /* XAuth */) {
    assert(binder?.raw && binder.buildXHeaders, 'XActions needs binder');
    this.binder = binder;
    this.raw = binder.raw;
    this._seeds = []; // URLs to help discover opIds
  }

  _headersForm(referer) {
    const h = this.binder.buildXHeaders({ referer, mode: 'api' });
    return { ...h, 'content-type': 'application/x-www-form-urlencoded' };
  }
  _headersJson(referer) {
    const h = this.binder.buildXHeaders({ referer, mode: 'api' });
    return { ...h, 'content-type': 'application/json' };
  }

  _okOrThrowV11(resp, what) {
    const s = resp?.status || 0;
    if (s === 200) return;
    if (s === 403 || s === 226) {
      const msg = JSON.stringify(resp?.data || {});
      if (/already/i.test(msg)) return; // treat as ok
    }
    const err = resp?.data?.errors?.[0]?.message || resp?.data?.error || `HTTP ${s}`;
    throw new Error(`${what} failed: ${err}`);
  }
  _okOrThrowGql(resp, what) {
    const s = resp?.status || 0;
    if (s >= 200 && s < 300 && !resp?.data?.errors) return;
    const err = resp?.data?.errors?.[0]?.message || resp?.data?.error || `HTTP ${s}`;
    if (/already/i.test(err)) return;
    throw new Error(`${what} failed: ${err}`);
  }

  /* =============== helpers =============== */
  async _ensureOpId(name, seeds = this._seeds) {
    await this.binder.discoverOpIds(seeds);
    let id = this.binder.getOpId(name);
    if (!id) {
      await this.binder.discoverBearer().catch(()=>{});
      this.binder._opIds = null;
      await this.binder.discoverOpIds(seeds);
      id = this.binder.getOpId(name);
    }
    return id;
  }

  async _postGqlOnce(opName, url, body, referer, what) {
    const r = await this.raw.post(url, body, {
      headers: this._headersJson(referer),
      validateStatus: s => s >= 200 && s < 500
    });
    // if 404 → likely stale/missing opId mapping
    if (r?.status === 404) throw new Error('__OPID_404__');
    this._okOrThrowGql(r, what);
    return r;
  }

  async _postGqlWithRediscover(opName, buildUrlAndBody, referer, what) {
    try {
      const { url, body } = await buildUrlAndBody();
      return await this._postGqlOnce(opName, url, body, referer, what);
    } catch (e) {
      if (String(e?.message) !== '__OPID_404__') throw e;
      // rediscover with seeds & retry once
      this.binder._opIds = null;
      await this.binder.discoverOpIds(this._seeds);
      const { url, body } = await buildUrlAndBody();
      return await this._postGqlOnce(opName, url, body, referer, what);
    }
  }

  /* =============== v1.1 endpoints =============== */
  async v11_like(id, referer, log) {
    const body = new URLSearchParams({ id: String(id) }).toString();
    const r = await this.raw.post('https://x.com/i/api/1.1/favorites/create.json', body, {
      headers: this._headersForm(referer), validateStatus: s => s >= 200 && s < 500
    });
    this._okOrThrowV11(r, 'like'); log?.debug?.('[v1.1] like ok');
  }
  async v11_retweet(id, referer, log) {
    const url = `https://x.com/i/api/1.1/statuses/retweet/${id}.json`;
    const r = await this.raw.post(url, '', {
      headers: this._headersForm(referer), validateStatus: s => s >= 200 && s < 500
    });
    this._okOrThrowV11(r, 'retweet'); log?.debug?.('[v1.1] retweet ok');
  }
  async v11_follow(screen, referer, log) {
    const body = new URLSearchParams({ screen_name: String(screen), follow: 'true' }).toString();
    const r = await this.raw.post('https://x.com/i/api/1.1/friendships/create.json', body, {
      headers: this._headersForm(referer), validateStatus: s => s >= 200 && s < 500
    });
    this._okOrThrowV11(r, 'follow'); log?.debug?.('[v1.1] follow ok');
  }
  async v11_post(text, referer, log) {
    const body = new URLSearchParams({ status: text, batch_mode: 'off' }).toString();
    const r = await this.raw.post('https://x.com/i/api/1.1/statuses/update.json', body, {
      headers: this._headersForm(referer), validateStatus: s => s >= 200 && s < 500
    });
    this._okOrThrowV11(r, 'post'); log?.debug?.('[v1.1] post ok');
  }
  async v11_reply(id, text, referer, log) {
    const form = new URLSearchParams({
      status: text,
      in_reply_to_status_id: String(id),
      auto_populate_reply_metadata: 'true',
      batch_mode: 'off'
    }).toString();
    const r = await this.raw.post('https://x.com/i/api/1.1/statuses/update.json', form, {
      headers: this._headersForm(referer), validateStatus: s => s >= 200 && s < 500
    });
    this._okOrThrowV11(r, 'reply'); log?.debug?.('[v1.1] reply ok');
  }

  /* =============== GraphQL endpoints (with features) =============== */
  async gql_like(id, referer, log) {
    const build = async () => {
      const opId = await this._ensureOpId('FavoriteTweet');
      if (!opId) throw new Error('FavoriteTweet opId not found');
      return {
        url: `https://x.com/i/api/graphql/${opId}/FavoriteTweet`,
        body: { variables: { tweet_id: String(id) }, features: featuresPreset(), fieldToggles: fieldTogglesPreset(), queryId: 'FavoriteTweet' }
      };
    };
    const r = await this._postGqlWithRediscover('FavoriteTweet', build, referer, 'like[gql]');
    log?.debug?.('[gql] like ok'); return r;
  }

  async gql_retweet(id, referer, log) {
    const build = async () => {
      const opId = await this._ensureOpId('CreateRetweet');
      if (!opId) throw new Error('CreateRetweet opId not found');
      return {
        url: `https://x.com/i/api/graphql/${opId}/CreateRetweet`,
        body: { variables: { tweet_id: String(id), dark_request: false }, features: featuresPreset(), fieldToggles: fieldTogglesPreset(), queryId: 'CreateRetweet' }
      };
    };
    const r = await this._postGqlWithRediscover('CreateRetweet', build, referer, 'retweet[gql]');
    log?.debug?.('[gql] retweet ok'); return r;
  }

  async gql_userByScreenName(screen, referer, log){
    const build = async () => {
      const opId = await this._ensureOpId('UserByScreenName');
      if (!opId) throw new Error('UserByScreenName opId not found');
      return {
        url: `https://x.com/i/api/graphql/${opId}/UserByScreenName`,
        body: { variables: { screen_name: String(screen), withSafetyModeUserFields: true }, features: featuresPreset(), fieldToggles: fieldTogglesPreset(), queryId: 'UserByScreenName' }
      };
    };
    const r = await this._postGqlWithRediscover('UserByScreenName', build, referer, 'userByScreenName[gql]');
    const rest_id = r?.data?.data?.user?.result?.rest_id;
    if (!rest_id) throw new Error('user id not found');
    return rest_id;
  }

  async gql_follow(screen, referer, log) {
    const userId = await this.gql_userByScreenName(screen, referer, log);
    const build = async () => {
      const opId = await this._ensureOpId('FollowUser');
      if (!opId) throw new Error('FollowUser opId not found');
      return {
        url: `https://x.com/i/api/graphql/${opId}/FollowUser`,
        body: { variables: { userId: String(userId) }, features: featuresPreset(), fieldToggles: fieldTogglesPreset(), queryId: 'FollowUser' }
      };
    };
    await this._postGqlWithRediscover('FollowUser', build, referer, 'follow[gql]');
    log?.debug?.('[gql] follow ok');
  }

  async gql_post(text, referer, log, extraVars = {}) {
    const build = async () => {
      const opId = await this._ensureOpId('CreateTweet');
      if (!opId) throw new Error('CreateTweet opId not found');
      return {
        url: `https://x.com/i/api/graphql/${opId}/CreateTweet`,
        body: {
          variables: {
            tweet_text: text,
            media: { media_entities: [], possibly_sensitive: false },
            semantic_annotation_ids: [],
            dark_request: false,
            ...extraVars,
          },
          features: featuresPreset(),
          fieldToggles: fieldTogglesPreset(),
          queryId: 'CreateTweet',
        }
      };
    };
    await this._postGqlWithRediscover('CreateTweet', build, referer, 'post[gql]');
    log?.debug?.('[gql] post ok');
  }

  async gql_reply(id, text, referer, log) {
    return this.gql_post(text, referer, log, {
      reply: { in_reply_to_tweet_id: String(id), exclude_reply_user_ids: [] }
    });
  }

  async gql_quote(tweetUrl, text, referer, log) {
    return this.gql_post(text || '', referer, log, { attachment_url: String(tweetUrl) });
  }

  /* =============== Public API =============== */
  async doFromAction(action, { referer }, log = console) {
    const t = String(action?.type || '').toLowerCase();
    const tweetId = firstNonEmpty(action.tweetId, parseTweetIdFromUrl(action.tweetUrl));
    const screen  = firstNonEmpty(action.screenName, parseScreenFromUrl(action.screenUrl));
    const text    = firstNonEmpty(action.text, action.content, action.postText);
    const tweetUrl = action.tweetUrl;

    // seeds for opId discovery (helps avoid 404)
    this._seeds = [tweetUrl, referer].filter(Boolean);

    // preflight ringan + jitter (kurangi 226)
    try { await this.binder.badgeCount().catch(()=>{}); } catch {}
    if (Math.random() < 0.5) await new Promise(r=>setTimeout(r, 400 + Math.random()*600));

    // parameter guards
    const needsId = (t==='like' || t==='retweet' || t==='reply' || t==='comment');
    if (needsId && !tweetId) {
      log.warn(`    no tweetId resolved for action "${t}" (url=${tweetUrl||'-'})`);
      return false;
    }
    if (t==='follow' && !screen) {
      log.warn(`    no screenName resolved for follow (url=${action.screenUrl||'-'})`);
      return false;
    }

    try {
      if (t === 'like')    { await this.v11_like(tweetId, referer, log); return true; }
      if (t === 'retweet') { await this.v11_retweet(tweetId, referer, log); return true; }
      if (t === 'follow')  { await this.v11_follow(screen, referer, log); return true; }
      if (t === 'post')    { await this.v11_post(text, referer, log); return true; }
      if (t === 'reply' || t === 'comment') { await this.v11_reply(tweetId, text || 'Nice!', referer, log); return true; }
      if (t === 'quote')   { await this.gql_quote(tweetUrl, text || '', referer, log); return true; }
      throw new Error('Unknown X action type: ' + t);
    } catch (e) {
      const msg = String(e?.message || '');
      if (!/(not authorized|HTTP 404|HTTP 400|HTTP 403|226|looks automated)/i.test(msg)) throw e;
      log.warn('      v1.1 failed → trying GraphQL fallback…');
      try {
        if (t === 'like')    { await this.gql_like(tweetId, referer, log); return true; }
        if (t === 'retweet') { await this.gql_retweet(tweetId, referer, log); return true; }
        if (t === 'follow')  { await this.gql_follow(screen, referer, log); return true; }
        if (t === 'post')    { await this.gql_post(text, referer, log); return true; }
        if (t === 'reply' || t === 'comment') { await this.gql_reply(tweetId, text || 'Nice!', referer, log); return true; }
        if (t === 'quote')   { await this.gql_quote(tweetUrl, text || '', referer, log); return true; }
      } catch (gqlErr) {
        log.warn('    action failed:', gqlErr?.message || gqlErr);

        // LAST RESORT: kalau retweet diblok (226) → coba quote
        if (t === 'retweet' && tweetUrl && /226|looks automated|not permitted|forbidden/i.test(String(gqlErr?.message||''))) {
          log.warn('    retweet blocked → trying quote as fallback…');
          try {
            await this.gql_quote(tweetUrl, text || '', referer, log);
            log.info('    quote fallback ok');
            // default: tetap false supaya runner tidak klaim kalau rule menuntut RT asli
            return false;
          } catch (qe) {
            log.warn('    quote fallback failed:', qe?.message || qe);
          }
        }
        return false; // fail-soft → runner akan menahan klaim
      }
    }
  }
}
