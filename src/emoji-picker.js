/**
 * TwemojiPicker — A premium emoji picker rendered entirely with Twemoji SVGs.
 * Designed to integrate with shadcn/ui design tokens.
 *
 * Usage:
 *   import { TwemojiPicker } from './emoji-picker.js';
 *   const picker = new TwemojiPicker({
 *     anchor: buttonElement,
 *     onSelect: (emoji) => console.log(emoji),
 *     onClose: () => {},
 *   });
 *   picker.toggle();
 */

// ── Emoji dataset (curated, categorized) ─────────────────────────
const CATEGORIES = [
  { id: 'recent',    icon: '🕐', label: '最近' },
  { id: 'smileys',   icon: '😊', label: '表情' },
  { id: 'people',    icon: '🤚', label: '手势' },
  { id: 'nature',    icon: '🌿', label: '自然' },
  { id: 'food',      icon: '🍕', label: '食物' },
  { id: 'activity',  icon: '⚽', label: '活动' },
  { id: 'travel',    icon: '✈️', label: '旅行' },
  { id: 'objects',   icon: '💡', label: '物品' },
  { id: 'symbols',   icon: '💜', label: '符号' },
  { id: 'flags',     icon: '🏁', label: '旗帜' },
];

// Curated emoji per category — compact but comprehensive
const EMOJI_DATA = {
  smileys: '😀😃😄😁😆😅🤣😂🙂🙃😉😊😇🥰😍🤩😘😗😚😙🥲😋😛😜🤪😝🤑🤗🤭🫢🫣🤫🤔🫡🤐🤨😐😑😶🫥😏😒🙄😬🤥🫠😌😔😪🤤😴😷🤒🤕🤢🤮🤧🥵🥶🥴😵🤯🤠🥳🥸😎🤓🧐😕🫤😟🙁😮😯😲😳🥺🥹😦😧😨😰😥😢😭😱😖😣😞😓😩😫🥱😤😡😠🤬😈👿💀☠️💩🤡👹👺👻👽👾🤖😺😸😹😻😼😽🙀😿😾',
  people: '👋🤚🖐️✋🖖🫱🫲🫳🫴👌🤌🤏✌️🤞🫰🤟🤘🤙👈👉👆🖕👇☝️🫵👍👎✊👊🤛🤜👏🙌🫶👐🤲🤝🙏✍️💅🤳💪🦾🦿🦵🦶👂🦻👃🧠🫀🫁🦷🦴👀👁️👅👄🫦👶🧒👦👧🧑👱👨👩🧓👴👵',
  nature: '🐶🐱🐭🐹🐰🦊🐻🐼🐻‍❄️🐨🐯🦁🐮🐷🐸🐵🙈🙉🙊🐒🐔🐧🐦🐤🐣🐥🦆🦅🦉🦇🐺🐗🐴🦄🐝🪱🐛🦋🐌🐞🐜🪲🪳🦟🦗🕷️🕸️🦂🐢🐍🦎🦖🦕🐙🦑🦐🦞🦀🪼🐡🐠🐟🐬🐳🐋🦈🦭🐊🐅🐆🦓🦍🦧🦣🐘🦛🦏🐪🐫🦒🦘🦬🐃🐂🐄🐎🐖🐏🐑🦙🐐🦌🐕🐩🦮🐈🐓🦃🦤🦚🦜🦢🦩🕊️🐇🦝🦨🦡🦫🦦🦥🐁🐀🐿️🦔🐾🐉🐲🌵🎄🌲🌳🌴🪹🌱🌿☘️🍀🎍🪴🎋🍃🍂🍁🪺🍄🌾💐🌷🌹🥀🌺🌸🌼🌻🌞🌝🌛🌜🌚🌕🌖🌗🌘🌑🌒🌓🌔🌙🌎🌍🌏🪐💫⭐🌟✨⚡☄️💥🔥🌪️🌈☀️🌤️⛅🌥️☁️🌦️🌧️⛈️🌩️🌨️❄️☃️⛄🌬️💨💧💦🫧☔☂️🌊',
  food: '🍏🍎🍐🍊🍋🍌🍉🍇🍓🫐🍈🍒🍑🥭🍍🥥🥝🍅🍆🥑🥦🥬🥒🌶️🫑🌽🥕🫒🧄🧅🥔🍠🫘🥐🥖🫓🥨🥯🥞🧇🧀🍖🍗🥩🥓🍔🍟🍕🌭🥪🌮🌯🫔🥙🧆🥚🍳🥘🍲🫕🥣🥗🍿🧈🧂🥫🍱🍘🍙🍚🍛🍜🍝🍠🍢🍣🍤🍥🥮🍡🥟🥠🥡🦀🦞🦐🦑🦪🍦🍧🍨🍩🍪🎂🍰🧁🥧🍫🍬🍭🍮🍯🍼🥛☕🫖🍵🍶🍾🍷🍸🍹🍺🍻🥂🥃🫗🥤🧋🧃🧉🧊🥢🍽️🍴🥄🔪🫙🏺',
  activity: '⚽🏀🏈⚾🥎🎾🏐🏉🥏🎱🪀🏓🏸🏒🏑🥍🏏🪃🥅⛳🪁🏹🎣🤿🥊🥋🎽🛹🛼🛷⛸️🥌🎿⛷️🏂🪂🏋️🤼🤸🤺⛹️🏇🧘🏄🏊🤽🚣🧗🚵🚴🏆🥇🥈🥉🏅🎖️🏵️🎗️🎫🎟️🎪🤹🎭🩰🎨🎬🎤🎧🎼🎹🥁🪘🎷🎺🎸🪕🎻🪗🎲♟️🎯🎳🎮🧩🧸🪅🪩🪆',
  travel: '🚗🚕🚙🚌🚎🏎️🚓🚑🚒🚐🛻🚚🚛🚜🏍️🛵🦽🦼🛺🚲🛴🛹🛼🚏🛣️🛤️🛞⛽🛞🚨🚥🚦🛑🚧⚓🛟⛵🛶🚤🛳️⛴️🛥️🚢✈️🛩️🛫🛬🪂💺🚁🚟🚠🚡🛰️🚀🛸🛎️🧳🏠🏡🏢🏣🏤🏥🏦🏨🏩🏪🏫🏬🏭🏯🏰💒🗼🗽⛪🕌🛕🕍⛩️🕋⛲⛺🌁🌃🏙️🌄🌅🌆🌇🌉♨️🎠🛝🎡🎢💈🎪🗻🌋🗾🏕️🏖️🏜️🏝️🏞️',
  objects: '⌚📱📲💻⌨️🖥️🖨️🖱️🖲️🕹️🗜️💾💿📀📼📷📸📹🎥📽️🎞️📞☎️📟📠📺📻🎙️🎚️🎛️🧭⏱️⏲️⏰🕰️⌛⏳📡🔋🪫🔌💡🔦🕯️🪔🧯🛢️💸💵💴💶💷🪙💰💳🪪💎⚖️🪜🧰🪛🔧🔩⚙️🪤🧲🔫💣🪓🔪🗡️⚔️🛡️🚬⚰️🪦⚱️🏺🔮📿🧿🪬💈⚗️🔭🔬🕳️🩹🩺🩻💊💉🩸🧬🦠🧫🧪🌡️🧹🪠🧺🧻🚽🚰🚿🛁🛀🧼🪥🪒🧽🪣🧴🔑🗝️🚪🪑🛋️🛏️🛌🧸🪆🖼️🪞🪟🛍️🛒🎁🎈🎏🎀🪄🪅🎊🎉🎎🏮🎐🧧✉️📩📨📧💌📥📤📦🏷️🪧📪📫📬📭📮📯📜📃📄📑🧾📊📈📉🗒️🗓️📆📅🗑️📇🗃️🗳️🗄️📋📁📂🗂️🗞️📰📓📔📒📕📗📘📙📚📖🔖🧷🔗📎🖇️📐📏🧮📌📍✂️🖊️🖋️✒️🖌️🖍️📝✏️🔍🔎🔏🔐🔒🔓',
  symbols: '❤️🩷🧡💛💚💙🩵💜🖤🩶🤍🤎💔❤️‍🔥❤️‍🩹❣️💕💞💓💗💖💘💝💟☮️✝️☪️🕉️☸️✡️🔯🕎☯️☦️🛐⛎♈♉♊♋♌♍♎♏♐♑♒♓🆔⚛️🉑☢️☣️📴📳🈶🈚🈸🈺🈷️✴️🆚💮🉐㊙️㊗️🈴🈵🈹🈲🅰️🅱️🆎🆑🅾️🆘❌⭕🛑⛔📛🚫💯💢♨️🚷🚯🚳🚱🔞📵🚭❗❕❓❔‼️⁉️🔅🔆〽️⚠️🚸🔱⚜️🔰♻️✅🈯💹❇️✳️❎🌐💠Ⓜ️🌀💤🏧🚾♿🅿️🛗🈳🈂️🛂🛃🛄🛅🚹🚺🚼⚧️🚻🚮🎦📶🈁🔣ℹ️🔤🔡🔠🆖🆗🆙🆒🆕🆓0️⃣1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣8️⃣9️⃣🔟🔢#️⃣*️⃣⏏️▶️⏸️⏯️⏹️⏺️⏭️⏮️⏩⏪⏫⏬◀️🔼🔽➡️⬅️⬆️⬇️↗️↘️↙️↖️↕️↔️↪️↩️⤴️⤵️🔀🔁🔂🔄🔃🎵🎶➕➖➗✖️🟰♾️💲💱™️©️®️👁️‍🗨️🔚🔙🔛🔝🔜〰️➰➿✔️☑️🔘🔴🟠🟡🟢🔵🟣⚫⚪🟤🔺🔻🔸🔹🔶🔷🔳🔲▪️▫️◾◽◼️◻️🟥🟧🟨🟩🟦🟪⬛⬜🟫🔈🔇🔉🔊🔔🔕📣📢💬💭🗯️♠️♣️♥️♦️🃏🎴🀄🕐🕑🕒🕓🕔🕕🕖🕗🕘🕙🕚🕛🕜🕝🕞🕟🕠🕡🕢🕣🕤🕥🕦🕧',
  flags: '🏳️🏴🏴‍☠️🏁🚩🏳️‍🌈🏳️‍⚧️🇺🇳🇦🇫🇦🇱🇩🇿🇦🇸🇦🇩🇦🇴🇦🇮🇦🇬🇦🇷🇦🇲🇦🇼🇦🇺🇦🇹🇦🇿🇧🇸🇧🇭🇧🇩🇧🇧🇧🇾🇧🇪🇧🇿🇧🇯🇧🇲🇧🇹🇧🇴🇧🇦🇧🇼🇧🇷🇧🇳🇧🇬🇧🇫🇧🇮🇰🇭🇨🇲🇨🇦🇨🇻🇨🇫🇹🇩🇨🇱🇨🇳🇨🇴🇰🇲🇨🇬🇨🇩🇨🇷🇨🇮🇭🇷🇨🇺🇨🇼🇨🇾🇨🇿🇩🇰🇩🇯🇩🇲🇩🇴🇪🇨🇪🇬🇸🇻🇬🇶🇪🇷🇪🇪🇸🇿🇪🇹🇪🇺🇫🇮🇫🇷🇬🇦🇬🇲🇬🇪🇩🇪🇬🇭🇬🇷🇬🇩🇬🇹🇬🇳🇬🇼🇬🇾🇭🇹🇭🇳🇭🇰🇭🇺🇮🇸🇮🇳🇮🇩🇮🇷🇮🇶🇮🇪🇮🇱🇮🇹🇯🇲🇯🇵🇯🇴🇰🇿🇰🇪🇰🇮🇽🇰🇰🇼🇰🇬🇱🇦🇱🇻🇱🇧🇱🇸🇱🇷🇱🇾🇱🇮🇱🇹🇱🇺🇲🇴🇲🇬🇲🇼🇲🇾🇲🇻🇲🇱🇲🇹🇲🇭🇲🇷🇲🇺🇲🇽🇫🇲🇲🇩🇲🇨🇲🇳🇲🇪🇲🇦🇲🇿🇲🇲🇳🇦🇳🇷🇳🇵🇳🇱🇳🇿🇳🇮🇳🇪🇳🇬🇰🇵🇲🇰🇳🇴🇴🇲🇵🇰🇵🇼🇵🇸🇵🇦🇵🇬🇵🇾🇵🇪🇵🇭🇵🇱🇵🇹🇵🇷🇶🇦🇷🇴🇷🇺🇷🇼🇰🇳🇱🇨🇻🇨🇼🇸🇸🇲🇸🇹🇸🇦🇸🇳🇷🇸🇸🇨🇸🇱🇸🇬🇸🇽🇸🇰🇸🇮🇸🇧🇸🇴🇿🇦🇰🇷🇸🇸🇪🇸🇱🇰🇸🇩🇸🇷🇸🇪🇨🇭🇸🇾🇹🇼🇹🇯🇹🇿🇹🇭🇹🇱🇹🇬🇹🇴🇹🇹🇹🇳🇹🇷🇹🇲🇹🇻🇺🇬🇺🇦🇦🇪🇬🇧🇺🇸🇺🇾🇺🇿🇻🇺🇻🇪🇻🇳🇾🇪🇿🇲🇿🇼',
};

// Split emoji strings into arrays (handles multi-codepoint emoji correctly)
function splitEmoji(str) {
  return [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(str)].map(s => s.segment);
}

const RECENT_KEY = 'twemoji-picker-recent';
const MAX_RECENT = 24;

function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}
function addRecent(emoji) {
  let recent = getRecent().filter(e => e !== emoji);
  recent.unshift(emoji);
  if (recent.length > MAX_RECENT) recent = recent.slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
}

// ── Twemoji URL helper ───────────────────────────────────────────
function twemojiUrl(emoji) {
  const codepoints = [...emoji].map(c => c.codePointAt(0).toString(16)).join('-')
    .replace(/-fe0f/g, ''); // strip variation selector for URL
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/${codepoints}.svg`;
}

function twemojiImg(emoji, size = 28) {
  return `<img src="${twemojiUrl(emoji)}" alt="${emoji}" draggable="false" style="width:${size}px;height:${size}px;" onerror="this.replaceWith(document.createTextNode('${emoji}'))">`;
}

// ── Search data (lazy built) ─────────────────────────────────────
// Simple keyword map for common emoji
const SEARCH_KEYWORDS = {
  '😀': 'happy smile grin face', '😂': 'laugh cry tears joy', '😍': 'love heart eyes',
  '🔥': 'fire hot flame lit', '💯': 'hundred perfect score', '❤️': 'heart love red',
  '👍': 'thumbs up good yes ok', '👎': 'thumbs down bad no', '🎉': 'party celebrate tada',
  '🚀': 'rocket launch ship fast', '💡': 'bulb idea light', '⭐': 'star favorite',
  '✅': 'check done complete', '❌': 'cross wrong no delete', '⚡': 'lightning fast zap bolt',
  '🎯': 'target bullseye goal aim', '🏆': 'trophy winner champion cup',
  '📌': 'pin pushpin location', '📎': 'paperclip attach clip', '🔗': 'link chain url',
  '📝': 'memo note write pencil', '📅': 'calendar date schedule', '⏰': 'alarm clock time',
  '🐛': 'bug insect debug', '🧪': 'test tube experiment lab', '🔧': 'wrench fix tool repair',
  '💻': 'computer laptop code dev', '📱': 'phone mobile cell',
  '🎨': 'art palette paint design', '🎵': 'music note song', '📸': 'camera photo picture',
  '🌟': 'star glow sparkle shine', '💎': 'gem diamond jewel precious',
  '🏠': 'home house building', '🏢': 'office building work',
  '☕': 'coffee tea cup drink', '🍕': 'pizza food slice', '🍺': 'beer drink cheers',
};

// ── Picker class ─────────────────────────────────────────────────
export class TwemojiPicker {
  constructor({ anchor, onSelect, onClose, popover }) {
    this.anchor = anchor;
    this.onSelect = onSelect;
    this.onClose = onClose || (() => {});
    this.popover = popover || false; // true = floating dropdown, false = inline
    this.el = null;
    this.activeCategory = 'smileys';
    this.searchQuery = '';
    this._onClickOutside = this._onClickOutside.bind(this);
    this._onKeydown = this._onKeydown.bind(this);
  }

  toggle() {
    if (this.el) { this.close(); return; }
    this.open();
  }

  open() {
    if (this.el) return;
    this.el = document.createElement('div');
    this.el.className = 'twpicker';
    this._render();

    if (this.popover) {
      // Floating popover mode — position below anchor
      this.el.classList.add('twpicker--popover');
      document.body.appendChild(this.el);
      this._positionPopover();
    } else {
      // Inline mode — insert after detail-header
      const header = this.anchor.closest('.detail-header');
      if (header && header.nextElementSibling) {
        header.parentElement.insertBefore(this.el, header.nextElementSibling);
      } else {
        this.anchor.parentElement.appendChild(this.el);
      }
    }

    this.el.classList.add('twpicker--open');

    setTimeout(() => {
      document.addEventListener('mousedown', this._onClickOutside);
      document.addEventListener('keydown', this._onKeydown);
    }, 10);
  }

  _positionPopover() {
    if (!this.el || !this.popover) return;
    const rect = this.anchor.getBoundingClientRect();
    const zoom = parseFloat(document.documentElement.style.zoom) || 1;
    let left = rect.left / zoom;
    let top = (rect.bottom + 6) / zoom;
    // Keep within viewport
    const pw = 320;
    if (left + pw > window.innerWidth) left = window.innerWidth - pw - 8;
    if (left < 8) left = 8;
    this.el.style.left = left + 'px';
    this.el.style.top = top + 'px';
  }

  close() {
    if (!this.el) return;
    this.el.classList.remove('twpicker--open');
    this.el.classList.add('twpicker--closing');
    document.removeEventListener('mousedown', this._onClickOutside);
    document.removeEventListener('keydown', this._onKeydown);
    const el = this.el;
    this.el = null;
    el.remove();
    this.onClose();
  }

  _onClickOutside(e) {
    if (this.el && !this.el.contains(e.target) && !this.anchor.contains(e.target)) {
      this.close();
    }
  }

  _onKeydown(e) {
    if (e.key === 'Escape') this.close();
  }

  _render() {
    const recent = getRecent();
    this.el.innerHTML = `
      <div class="twpicker__search">
        <input type="text" class="twpicker__input" placeholder="搜索 emoji..." />
      </div>
      <div class="twpicker__tabs"></div>
      <div class="twpicker__grid"></div>
    `;

    // Tabs
    const tabsEl = this.el.querySelector('.twpicker__tabs');
    CATEGORIES.forEach(cat => {
      if (cat.id === 'recent' && recent.length === 0) return;
      const tab = document.createElement('button');
      tab.className = 'twpicker__tab' + (cat.id === this.activeCategory ? ' twpicker__tab--active' : '');
      tab.innerHTML = twemojiImg(cat.icon, 18);
      tab.title = cat.label;
      tab.addEventListener('click', () => {
        this.activeCategory = cat.id;
        this.searchQuery = '';
        this.el.querySelector('.twpicker__input').value = '';
        this._renderTabs();
        this._renderGrid();
      });
      tabsEl.appendChild(tab);
    });

    // Search
    this.el.querySelector('.twpicker__input').addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this._renderGrid();
    });

    this._renderGrid();

    // Focus search
    setTimeout(() => this.el.querySelector('.twpicker__input')?.focus(), 50);
  }

  _renderTabs() {
    const tabs = this.el.querySelectorAll('.twpicker__tab');
    const recent = getRecent();
    let idx = 0;
    CATEGORIES.forEach(cat => {
      if (cat.id === 'recent' && recent.length === 0) return;
      if (tabs[idx]) {
        tabs[idx].classList.toggle('twpicker__tab--active', cat.id === this.activeCategory);
      }
      idx++;
    });
  }

  _renderGrid() {
    const gridEl = this.el.querySelector('.twpicker__grid');
    let emojis;

    if (this.searchQuery) {
      // Search across all categories
      emojis = [];
      for (const [, str] of Object.entries(EMOJI_DATA)) {
        emojis.push(...splitEmoji(str));
      }
      emojis = emojis.filter(e => {
        const kw = SEARCH_KEYWORDS[e] || '';
        return kw.includes(this.searchQuery) || e.includes(this.searchQuery);
      });
    } else if (this.activeCategory === 'recent') {
      emojis = getRecent();
    } else {
      emojis = splitEmoji(EMOJI_DATA[this.activeCategory] || '');
    }

    gridEl.innerHTML = emojis.length === 0
      ? '<div class="twpicker__empty">没有找到 emoji</div>'
      : '';

    emojis.forEach(emoji => {
      const btn = document.createElement('button');
      btn.className = 'twpicker__emoji';
      btn.innerHTML = twemojiImg(emoji, 28);
      btn.title = emoji;
      btn.addEventListener('click', () => {
        addRecent(emoji);
        this.onSelect(emoji);
        this.close();
      });
      gridEl.appendChild(btn);
    });
  }
}
