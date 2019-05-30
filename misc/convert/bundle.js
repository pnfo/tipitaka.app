!function(e){var t={};function r(a){if(t[a])return t[a].exports;var n=t[a]={i:a,l:!1,exports:{}};return e[a].call(n.exports,n,n.exports,r),n.l=!0,n.exports}r.m=e,r.c=t,r.d=function(e,t,a){r.o(e,t)||Object.defineProperty(e,t,{enumerable:!0,get:a})},r.r=function(e){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})},r.t=function(e,t){if(1&t&&(e=r(e)),8&t)return e;if(4&t&&"object"==typeof e&&e&&e.__esModule)return e;var a=Object.create(null);if(r.r(a),Object.defineProperty(a,"default",{enumerable:!0,value:e}),2&t&&"string"!=typeof e)for(var n in e)r.d(a,n,function(t){return e[t]}.bind(null,n));return a},r.n=function(e){var t=e&&e.__esModule?function(){return e.default}:function(){return e};return r.d(t,"a",t),t},r.o=function(e,t){return Object.prototype.hasOwnProperty.call(e,t)},r.p="",r(r.s=0)}([function(e,t,r){"use strict";var a=r(1),n=r(2);let o=localStorage.getItem("convert-prev-script")||a.Script.RO;$("#box2").attr("script",o);const i=$("#pali-script-select");function c(){const e=a.TextProcessor.convertFromMixed($("#box1").val());console.log(e),$("#box2").val(a.TextProcessor.convert(e,o))}a.paliScriptInfo.forEach((e,t)=>{n.Util.createLanguageSelectOption(t,e,"../../static/images/").appendTo(i)}),i.on("click",".option",e=>{const t=$(e.currentTarget);t.addClass("active").siblings().removeClass("active"),console.log(`Pali script changing to ${t.attr("value")}`),o=t.attr("value"),localStorage.setItem("convert-prev-script",o),$("#box2").attr("script",o),c()}).children(`[value=${o}]`).addClass("active"),$("#box1").on("change input paste keyup",e=>{const t=(0,a.getScriptForCode)($("#box1").val()?$("#box1").val().charCodeAt(0):0);$("#box1").attr("script",t),c()}),$("#copy-button").click(e=>{n.Util.copyText($("#box2").val()),n.Util.showToast(`Your text in ${a.paliScriptInfo.get(o)[0]} script has been copied to the clipboard. You can now paste it.`)}),$("#menu-toggle").mousedown(function(e){$("#menu-list").animate({height:"toggle"},200),e.stopPropagation()}),$("#menu-list").mousedown(function(e){e.stopPropagation()}),$("body").mousedown(function(){$("#menu-list").animate({height:"hide"},350)})},function(e,t,r){"use strict";r.r(t),r.d(t,"TextProcessor",function(){return O}),r.d(t,"Script",function(){return a}),r.d(t,"paliScriptInfo",function(){return n}),r.d(t,"getScriptForCode",function(){return o});const a=Object.freeze({SI:"si",HI:"hi",RO:"ro",THAI:"th",LAOS:"lo",MY:"my",KM:"km",BENG:"be",GURM:"gm",THAM:"tt",GUJA:"gj",TELU:"te",KANN:"ka",MALA:"mm",BRAH:"br",TIBT:"tb",CYRL:"cy"}),n=new Map([[a.SI,["Sinhala","සිංහල",[[3456,3583]],{f:"sl_flag.png"}]],[a.HI,["Devanagari","हिन्दी",[[2304,2431]],{f:"in_flag.png"}]],[a.RO,["Roman","Roman",[[0,383],[7680,7935]],{f:"uk_flag.png"}]],[a.THAI,["Thai","ไทย",[[3584,3711],63247,63232],{f:"th_flag.png"}]],[a.LAOS,["Laos","ລາວ",[[3712,3839]],{f:"laos_flag.png"}]],[a.MY,["Myanmar","ဗမာစာ",[[4096,4223]],{f:"my_flag.png"}]],[a.KM,["Khmer","ភាសាខ្មែរ",[[6016,6143]],{f:"kh_flag.png"}]],[a.BENG,["Bengali","বাংলা",[[2432,2559]],{f:"bangla_flag.png"}]],[a.GURM,["Gurmukhi","ਗੁਰਮੁਖੀ",[[2560,2687]],{}]],[a.THAM,["Tai Tham","Tai Tham LN",[[6688,6831]],{c:"beta-script"}]],[a.GUJA,["Gujarati","ગુજરાતી",[[2688,2815]],{}]],[a.TELU,["Telugu","తెలుగు",[[3072,3199]],{}]],[a.KANN,["Kannada","ಕನ್ನಡ",[[3200,3327]],{}]],[a.MALA,["Malayalam","മലയാളം",[[3328,3455]],{}]],[a.BRAH,["Brahmi","Brāhmī",[[55300,55300],[56320,56447]],{}]],[a.TIBT,["Tibetan","བོད་སྐད།",[[3840,4095]],{f:"tibet_flag.png",c:"larger"}]],[a.CYRL,["Cyrillic","кириллица",[[1024,1279],[768,879]],{f:"russia_flag.png"}]]]);function o(e){for(let t of n)for(let r of t[1][2]){if(Array.isArray(r)&&e>=r[0]&&e<=r[1])return t[0];if(Number.isInteger(r)&&e==r)return t[0]}return-1}const i={[a.SI]:0,[a.HI]:1,[a.RO]:2,[a.THAI]:3,[a.LAOS]:4,[a.MY]:5,[a.KM]:6,[a.BENG]:7,[a.GURM]:8,[a.THAM]:9,[a.GUJA]:10,[a.TELU]:11,[a.KANN]:12,[a.MALA]:13,[a.BRAH]:14,[a.TIBT]:15,[a.CYRL]:16},c=[["අ","अ","a","อ","ອ","အ","អ","অ","ਅ","ᩋ","અ","అ","ಅ","അ","𑀅","ཨ","а"],["ආ","आ","ā","อา","ອາ","အာ","អា","আ","ਆ","ᩌ","આ","ఆ","ಆ","ആ","𑀆","ཨཱ","а̄"],["ඉ","इ","i","อิ","ອິ","ဣ","ឥ","ই","ਇ","ᩍ","ઇ","ఇ","ಇ","ഇ","𑀇","ཨི","и"],["ඊ","ई","ī","อี","ອີ","ဤ","ឦ","ঈ","ਈ","ᩎ","ઈ","ఈ","ಈ","ഈ","𑀈","ཨཱི","ӣ"],["උ","उ","u","อุ","ອຸ","ဥ","ឧ","উ","ਉ","ᩏ","ઉ","ఉ","ಉ","ഉ","𑀉","ཨུ","у"],["ඌ","ऊ","ū","อู","ອູ","ဦ","ឩ","ঊ","ਊ","ᩐ","ઊ","ఊ","ಊ","ഊ","𑀊","ཨཱུ","ӯ"],["එ","ए","e","อเ","ອເ","ဧ","ឯ","এ","ਏ","ᩑ","એ","ఏ","ಏ","ഏ","𑀏","ཨེ","е"],["ඔ","ओ","o","อโ","ອໂ","ဩ","ឱ","ও","ਓ","ᩒ","ઓ","ఓ","ಓ","ഓ","𑀑","ཨོ","о"],["ං","ं","ṃ","ํ","ໍ","ံ","ំ","ং","ਂ","ᩴ","ં","ం","ಂ","ം","𑀁","ཾ","м̣"],["ඃ","ः","ḥ","ะ","ະ","း","ះ","ঃ","ਃ","ᩡ","ઃ","ః","ಃ","ഃ","𑀂","ཿ","х̣"],["්","्","","ฺ","຺","္","្","্","੍","᩠","્","్","್","്","𑁆","྄",""],["0","०","0","๐","໐","၀","០","০","੦","᪐","૦","౦","೦","൦","𑁦","༠","0"],["1","१","1","๑","໑","၁","១","১","੧","᪑","૧","౧","೧","൧","𑁧","༡","1"],["2","२","2","๒","໒","၂","២","২","੨","᪒","૨","౨","೨","൨","𑁨","༢","2"],["3","३","3","๓","໓","၃","៣","৩","੩","᪓","૩","౩","೩","൩","𑁩","༣","3"],["4","४","4","๔","໔","၄","៤","৪","੪","᪔","૪","౪","೪","൪","𑁪","༤","4"],["5","५","5","๕","໕","၅","៥","৫","੫","᪕","૫","౫","೫","൫","𑁫","༥","5"],["6","६","6","๖","໖","၆","៦","৬","੬","᪖","૬","౬","೬","൬","𑁬","༦","6"],["7","७","7","๗","໗","၇","៧","৭","੭","᪗","૭","౭","೭","൭","𑁭","༧","7"],["8","८","8","๘","໘","၈","៨","৮","੮","᪘","૮","౮","೮","൮","𑁮","༨","8"],["9","९","9","๙","໙","၉","៩","৯","੯","᪙","૯","౯","೯","൯","𑁯","༩","9"]],s=[["ක","क","k","ก","ກ","က","ក","ক","ਕ","ᨠ","ક","క","ಕ","ക","𑀓","ཀ","к"],["ඛ","ख","kh","ข","ຂ","ခ","ខ","খ","ਖ","ᨡ","ખ","ఖ","ಖ","ഖ","𑀔","ཁ","кх"],["ග","ग","g","ค","ຄ","ဂ","គ","গ","ਗ","ᨣ","ગ","గ","ಗ","ഗ","𑀕","ག","г"],["ඝ","घ","gh","ฆ","ຆ","ဃ","ឃ","ঘ","ਘ","ᨥ","ઘ","ఘ","ಘ","ഘ","𑀖","གྷ","гх"],["ඞ","ङ","ṅ","ง","ງ","င","ង","ঙ","ਙ","ᨦ","ઙ","ఙ","ಙ","ങ","𑀗","ང","н̇"],["ච","च","c","จ","ຈ","စ","ច","চ","ਚ","ᨧ","ચ","చ","ಚ","ച","𑀘","ཙ","ч"],["ඡ","छ","ch","ฉ","ຉ","ဆ","ឆ","ছ","ਛ","ᨨ","છ","ఛ","ಛ","ഛ","𑀙","ཚ","чх"],["ජ","ज","j","ช","ຊ","ဇ","ជ","জ","ਜ","ᨩ","જ","జ","ಜ","ജ","𑀚","ཛ","дж"],["ඣ","झ","jh","ฌ","ຌ","ဈ","ឈ","ঝ","ਝ","ᨫ","ઝ","ఝ","ಝ","ഝ","𑀛","ཛྷ","джх"],["ඤ","ञ","ñ","ญ","ຎ","ဉ","ញ","ঞ","ਞ","ᨬ","ઞ","ఞ","ಞ","ഞ","𑀜","ཉ","н̃"],["ට","ट","ṭ","ฏ","ຏ","ဋ","ដ","ট","ਟ","ᨭ","ટ","ట","ಟ","ട","𑀝","ཊ","т̣"],["ඨ","ठ","ṭh","ฐ","ຐ","ဌ","ឋ","ঠ","ਠ","ᨮ","ઠ","ఠ","ಠ","ഠ","𑀞","ཋ","т̣х"],["ඩ","ड","ḍ","ฑ","ຑ","ဍ","ឌ","ড","ਡ","ᨯ","ડ","డ","ಡ","ഡ","𑀟","ཌ","д̣"],["ඪ","ढ","ḍh","ฒ","ຒ","ဎ","ឍ","ঢ","ਢ","ᨰ","ઢ","ఢ","ಢ","ഢ","𑀠","ཌྷ","д̣х"],["ණ","ण","ṇ","ณ","ຓ","ဏ","ណ","ণ","ਣ","ᨱ","ણ","ణ","ಣ","ണ","𑀡","ཎ","н̣"],["ත","त","t","ต","ຕ","တ","ត","ত","ਤ","ᨲ","ત","త","ತ","ത","𑀢","ཏ","т"],["ථ","थ","th","ถ","ຖ","ထ","ថ","থ","ਥ","ᨳ","થ","థ","ಥ","ഥ","𑀣","ཐ","тх"],["ද","द","d","ท","ທ","ဒ","ទ","দ","ਦ","ᨴ","દ","ద","ದ","ദ","𑀤","ད","д"],["ධ","ध","dh","ธ","ຘ","ဓ","ធ","ধ","ਧ","ᨵ","ધ","ధ","ಧ","ധ","𑀥","དྷ","дх"],["න","न","n","น","ນ","န","ន","ন","ਨ","ᨶ","ન","న","ನ","ന","𑀦","ན","н"],["ප","प","p","ป","ປ","ပ","ប","প","ਪ","ᨸ","પ","ప","ಪ","പ","𑀧","པ","п"],["ඵ","फ","ph","ผ","ຜ","ဖ","ផ","ফ","ਫ","ᨹ","ફ","ఫ","ಫ","ഫ","𑀨","ཕ","пх"],["බ","ब","b","พ","ພ","ဗ","ព","ব","ਬ","ᨻ","બ","బ","ಬ","ബ","𑀩","བ","б"],["භ","भ","bh","ภ","ຠ","ဘ","ភ","ভ","ਭ","ᨽ","ભ","భ","ಭ","ഭ","𑀪","བྷ","бх"],["ම","म","m","ม","ມ","မ","ម","ম","ਮ","ᨾ","મ","మ","ಮ","മ","𑀫","མ","м"],["ය","य","y","ย","ຍ","ယ","យ","য","ਯ","ᨿ","ય","య","ಯ","യ","𑀬","ཡ","й"],["ර","र","r","ร","ຣ","ရ","រ","র","ਰ","ᩁ","ર","ర","ರ","ര","𑀭","ར","р"],["ල","ल","l","ล","ລ","လ","ល","ল","ਲ","ᩃ","લ","ల","ಲ","ല","𑀮","ལ","л"],["ළ","ळ","ḷ","ฬ","ຬ","ဠ","ឡ","ল়","ਲ਼","ᩊ","ળ","ళ","ಳ","ള","𑀴","ལ༹","л̣"],["ව","व","v","ว","ວ","ဝ","វ","ৰ","ਵ","ᩅ","વ","వ","ವ","വ","𑀯","ཝ","в"],["ස","स","s","ส","ສ","သ","ស","স","ਸ","ᩈ","સ","స","ಸ","സ","𑀲","ས","с"],["හ","ह","h","ห","ຫ","ဟ","ហ","হ","ਹ","ᩉ","હ","హ","ಹ","ഹ","𑀳","ཧ","х"]],l=[["ා","ा","ā","า","າ","ာ","ា","া","ਾ","ᩣ","ા","ా","ಾ","ാ","𑀸","ཱ","а̄"],["ි","ि","i","ิ","ິ","ိ","ិ","ি","ਿ","ᩥ","િ","ి","ಿ","ി","𑀺","ི","и"],["ී","ी","ī","ี","ີ","ီ","ី","ী","ੀ","ᩦ","ી","ీ","ೀ","ീ","𑀻","ཱི","ӣ"],["ු","ु","u","ุ","ຸ","ု","ុ","ু","ੁ","ᩩ","ુ","ు","ು","ു","𑀼","ུ","у"],["ූ","ू","ū","ู","ູ","ူ","ូ","ূ","ੂ","ᩪ","ૂ","ూ","ೂ","ൂ","𑀽","ཱུ","ӯ"],["ෙ","े","e","เ","ເ","ေ","េ","ে","ੇ","ᩮ","ે","ే","ೇ","േ","𑁂","ེ","е"],["ො","ो","o","โ","ໂ","ော","ោ","ো","ੋ","ᩮᩣ","ો","ో","ೋ","ോ","𑁄","ོ","о"]];function u(e,t,r=""){return"cen"==r?e=e.replace(/॥/g,""):r.startsWith("ga")&&(e=(e=e.replace(/।/g,";")).replace(/॥/g,".")),e=(e=(e=(e=e.replace(/॰…/g,"…")).replace(/॰/g,"·")).replace(/[।॥]/g,".")).replace(/\s([\s,!;\?\.])/g,"$1")}function p(e,t,r=""){if(t==a.THAI)return e.replace(/([ก-ฮ])([เโ])/g,"$2$1");if(t==a.LAOS)return e.replace(/([ກ-ຮ])([ເໂ])/g,"$2$1");throw new Error(`Unsupported script ${t} for swap_e_o method.`)}function g(e,t){if(t==a.THAI)return e.replace(/([เโ])([ก-ฮ])/g,"$2$1");if(t==a.LAOS)return e.replace(/([ເໂ])([ກ-ຮ])/g,"$2$1");throw new Error(`Unsupported script ${t} for un_swap_e_o method.`)}function h(e){return e.replace(/\u200C|\u200D/g,"")}const f=[],d={[a.SI]:[function(e,t,r=""){return e.replace(/\u0DCA([\u0DBA\u0DBB])/g,"්‍$1")},u],[a.RO]:[u,function(e,t,r=""){return(e=(e=e.replace(/^((?:<w>)?\S)/g,(e,t)=>t.toUpperCase())).replace(/([\.\?]\s(?:<w>)?)(\S)/g,(e,t,r)=>`${t}${r.toUpperCase()}`)).replace(/([\u201C‘](?:<w>)?)(\S)/g,(e,t,r)=>`${t}${r.toUpperCase()}`)}],[a.THAI]:[p,function(e,t){return(e=(e=e.replace(/\u0E34\u0E4D/g,"ึ")).replace(/ญ/g,"")).replace(/ฐ/g,"")},u],[a.LAOS]:[p,u],[a.MY]:[function(e,t,r=""){return(e=(e=(e=(e=(e=(e=(e=(e=(e=e.replace(/[,;]/g,"၊")).replace(/[\u2026\u0964\u0965]+/g,"။")).replace(/ဉ\u1039ဉ/g,"ည")).replace(/သ\u1039သ/g,"ဿ")).replace(/င္([က-ဠ])/g,"င်္$1")).replace(/္ယ/g,"ျ")).replace(/္ရ/g,"ြ")).replace(/္ဝ/g,"ွ")).replace(/္ဟ/g,"ှ")).replace(/([ခဂဒပဝ](:?္[က-ဠ])?ေ?)ာ/g,"$1ါ")},u],[a.KM]:[u],[a.THAM]:[function(e){return(e=(e=(e=e.replace(/\u1A60\u1A41/g,"ᩕ")).replace(/\u1A48\u1A60\u1A48/g,"ᩔ")).replace(/।/g,"᪨")).replace(/॥/g,"᪩")}],[a.GUJA]:[u],[a.TELU]:[u],[a.MALA]:[u],[a.BRAH]:[function(e){return(e=(e=e.replace(/।/g,"𑁇")).replace(/॥/g,"𑁈")).replace(/–/g,"𑁋")},u],[a.TIBT]:[function(e){e=(e=e.replace(/।/g,"།")).replace(/॥/g,"༎");for(let t=0;t<=39;t++)e=e.replace(new RegExp(String.fromCharCode(3972,3904+t),"g"),String.fromCharCode(3984+t));return(e=(e=(e=(e=e.replace(/\u0F61\u0FB1/g,"ཡྻ")).replace(/\u0F5D\u0FAD/g,"ཝྺ")).replace(/\u0F5B\u0FAC/g,"ཛ྄ཛྷ")).replace(/\u0F61\u0FB7/g,"ཡ྄ཧ")).replace(/\u0F5D\u0FB7/g,"ཝ྄ཧ")}],[a.CYRL]:[u]},m=[],$={[a.SI]:[h],[a.HI]:[h],[a.RO]:[e=>e.toLowerCase()],[a.THAI]:[function(e,t){return(e=(e=(e=e.replace(/ฎ/g,"ฏ")).replace(/\u0E36/g,"ิํ")).replace(/\uF70F/g,"ญ")).replace(/\uF700/g,"ฐ")},g],[a.LAOS]:[g],[a.MY]:[function(e){return(e=(e=(e=(e=(e=(e=(e=(e=(e=e.replace(/\u102B/g,"ာ")).replace(/ှ/g,"္ဟ")).replace(/ွ/g,"္ဝ")).replace(/ြ/g,"္ရ")).replace(/ျ/g,"္ယ")).replace(/\u103A/g,"")).replace(/ဿ/g,"သ္သ")).replace(/ည/g,"ဉ္ဉ")).replace(/၊/g,",")).replace(/။/g,".")}],[a.TIBT]:[function(e){return e}]};function v(e,t,r=!0){let a=s.concat(c,r?l:[]),n=[[],[],[]];return a.forEach(r=>{r[e]&&n[r[e].length-1].push([r[e],r[t]])}),n.filter(e=>e.length).map(e=>[e[0][0].length,new Map(e)]).reverse()}function b(e,t){let r=new Array,a=0;for(;a<e.length;){let n=!1;for(let[o,i]of t){const t=e.substr(a,o);if(i.has(t)){r.push(i.get(t)),n=!0,a+=o;break}}n||(r.push(e.charAt(a)),a++)}return r.join("")}function w(e,t){const r=t==a.CYRL?"а":"a";return(e=(e=e.replace(new RegExp(`([ක-ෆ])([^ා-ෟ්${r}])`,"g"),`$1${r}$2`)).replace(new RegExp(`([ක-ෆ])([^ා-ෟ්${r}])`,"g"),`$1${r}$2`)).replace(/([ක-ෆ])$/g,`$1${r}`)}const C={"අ":"","ආ":"ා","ඉ":"ි","ඊ":"ී","උ":"ු","ඌ":"ූ","එ":"ෙ","ඔ":"ො"};function A(e,t){return e=(e=(e=(e=e.replace(/([ක-ෆ])([^අආඉඊඋඌඑඔ\u0DCA])/g,"$1්$2")).replace(/([ක-ෆ])([^අආඉඊඋඌඑඔ\u0DCA])/g,"$1්$2")).replace(/([ක-ෆ])$/g,"$1්")).replace(/([ක-ෆ])([අආඉඊඋඌඑඔ])/g,(e,t,r)=>t+C[r])}const T=[E],S={[a.SI]:[],[a.RO]:[w,E],[a.CYRL]:[w,E]},y=[function(e,t){const r=v(i[t],i[a.SI]);return b(e,r)}],x={[a.SI]:[],[a.RO]:[M,e=>e.replace(/ṁ/g,"ං"),A],[a.CYRL]:[M,A]};function E(e,t){return b(e,v(i[a.SI],i[t]))}function M(e,t){return b(e,v(i[t],i[a.SI],!1))}class O{static basicConvert(e,t){return(S[t]||T).forEach(r=>e=r(e,t)),e}static basicConvertFrom(e,t){return(x[t]||y).forEach(r=>e=r(e,t)),e}static beautify(e,t,r=""){return(d[t]||f).forEach(a=>e=a(e,t,r)),e}static convert(e,t){return e=this.basicConvert(e,t),this.beautify(e,t)}static convertFrom(e,t){return($[t]||m).forEach(r=>e=r(e,t)),this.basicConvertFrom(e,t)}static convertFromMixed(e){e=h(e)+" ";let t=-1,r="",a="";for(let n=0;n<e.length;n++){const i=o(e.charCodeAt(n));i!=t||n==e.length-1?(console.log(`process run: "${r}", i: ${n}, script: ${t}`),a+=this.convertFrom(r,t),t=i,r=e.charAt(n)):r+=e.charAt(n)}return a}}},function(e,t,r){"use strict";Object.defineProperty(t,"__esModule",{value:!0});t.Util=class{static copyText(e){const t=document.createElement("textarea");t.value=e,document.body.appendChild(t),t.select(),document.execCommand("copy"),document.body.removeChild(t)}static showToast(e){var t=$("#toast").html(e).fadeIn(300);setTimeout(function(){t.fadeOut()},3e3)}static getParameterByName(e,t){e=e.replace(/[\[]/,"\\[").replace(/[\]]/,"\\]");var r=new RegExp("[\\?&]"+e+"=([^&#]*)").exec(location.search);return null===r?t:decodeURIComponent(r[1].replace(/\+/g," "))}static createLanguageSelectOption(e,t,r="./static/images/"){const a=$("<span/>").addClass("UT").text(t[1]).attr("lang",e),n=t[3].f?$("<img/>").attr("src",`${r}${t[3].f}`):"",o=$("<div/>").addClass("option").append(a,n).attr("value",e);return t[3].c&&o.addClass(t[3].c),o}static createDictionarySelectOption(e,t,r){const a=$("<span/>").addClass("UT").text(t[1]).attr("lang",t[0]),n=r[3].f?$("<img/>").attr("src",`./static/images/${r[3].f}`):"";return $("<div/>").addClass("check option").append(a,n).attr("value",e)}static showDialog(e,t="",r=""){const a=$("#"+e);return dialogPolyfill.registerDialog(a[0]),t&&a.empty().append(t),r&&(r.addClass("highlighted"),a.on("close",e=>r.removeClass("highlighted"))),a[0].showModal(),a}static levenshtein(e,t){let r;if(0===e.length)return t.length;if(0===t.length)return e.length;e.length>t.length&&(r=e,e=t,t=r);let a,n,o,i=e.length,c=t.length,s=Array(i);for(a=0;a<=i;a++)s[a]=a;for(a=1;a<=c;a++)for(o=a,n=1;n<=i;n++)r=s[n-1],s[n-1]=o,o=t[a-1]===e[n-1]?r:Math.min(r+1,Math.min(o+1,s[n]+1));return o}static toggleFullScreen(e){var t=window.document,r=t.documentElement,a=r.requestFullscreen||r.mozRequestFullScreen||r.webkitRequestFullScreen||r.msRequestFullscreen,n=t.exitFullscreen||t.mozCancelFullScreen||t.webkitExitFullscreen||t.msExitFullscreen;!e||t.fullscreenElement||t.mozFullScreenElement||t.webkitFullscreenElement||t.msFullscreenElement?e||n.call(t):a.call(r)}};class a{constructor(e,t,r={}){this.root=e,this.hlElem=t,this.customCss=r,this.isOpen=!1}show(e,t=$("body")){if(this.root.css("position","relative"),this.dlgDiv=$("<div/>").addClass("jdialog").append(e).appendTo(this.root).css("width",Math.min(t.width(),e.outerWidth())).css(this.customCss).click(e=>e.stopPropagation()),this.dlgDiv.offset().left+this.dlgDiv.width()>t.offset().left+t.width()){const e=t.offset().left+t.width()-(this.root.offset().left+this.root.width());this.dlgDiv.css("left","auto").css("right",-e)}return this.hlElem&&this.hlElem.addClass("highlighted"),this.isOpen=!0,this}close(){this.dlgDiv&&this.dlgDiv.remove(),this.hlElem&&this.hlElem.removeClass("highlighted"),this.isOpen=!1}}t.JDialog=a;const n=new Map;class o{static create(e,t,r,i,c){o.destroy(e);const s=new a(r,r,c),l=setTimeout(()=>s.show(i()),t);n.set(e,{jdlg:s,timer:l})}static destroy(e){if(n.has(e)){const t=n.get(e);clearTimeout(t.timer),t.jdlg&&t.jdlg.close()}}}t.JHoverDialog=o;const i=new Map([["text",["#text-view-area","#text-view-button"]],["settings",["#settings-area","#settings-button"]],["search",["#search-area",".search-bar"]],["fts",["#fts-area",".search-bar"]],["bookmarks",["#bookmarks-area",""]],["help",["#help-area",""]]]);t.vManager=new class{constructor(){this.curPane=this.prevPane="",this.registerEvents(),this.showPane("settings"),i.forEach(e=>$(e[1]).addClass("top-pane-status"))}showPane(e){"back"==e&&(e=this.prevPane),$("div.top-pane").hide(),$(".top-pane-status").removeClass("selected");const t=i.get(e);$(t[0]).show(),t[1]&&$(t[1]).addClass("selected"),this.prevPane=this.curPane,this.curPane=e,this.hideOverlappingContainers()}registerEvents(){$("#settings-button").click(e=>this.showPane("settings")),$("#text-view-button").click(e=>this.showPane("text")),$("#menu-toggle").mousedown(function(e){$("#menu-list").animate({height:"toggle"},200),e.stopPropagation()}),$("#tree-toggle").mousedown(function(e){$(".pitaka-tree-container").animate({width:"toggle"},250),$(".pitaka-tree-container").toggleClass("user-opened"),e.stopPropagation()}),$("#menu-list, .pitaka-tree-container").mousedown(function(e){e.stopPropagation()}),$("body").mousedown(e=>this.hideOverlappingContainers()),$("dialog").click(e=>{$(e.target).is("dialog")&&e.target.close("cancelled")}),$(".help-button").click(e=>this.loadHelp(e)),$("#help-menu-item,#about-menu-item,#offline-software-menu-item").click(e=>{this.loadHelp(e),this.hideOverlappingContainers()})}hideOverlappingContainers(){$("#menu-list").animate({height:"hide"},250),"absolute"==$(".pitaka-tree-container").css("position")&&$(".pitaka-tree-container").animate({width:"hide"},250)}async loadHelp(e=null){const t=$("#help-area");if(!t.children().length){const e=await $.get(`./static/help-${t.attr("lang")}.html`);t.html(e),$("i",t).each((e,t)=>$(t).addClass("fa-fw"))}if(this.showPane("help"),e){const r=$(e.currentTarget).attr("sec"),a=$(`[sec=${r}]`,t);t.scrollTop(t.scrollTop()+a.position().top)}}}}]);