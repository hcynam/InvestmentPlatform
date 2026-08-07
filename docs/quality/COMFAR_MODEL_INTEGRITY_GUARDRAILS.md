# قرارداد یکپارچگی مدل COMFAR

این فایل قرارداد اجرایی مدل است؛ هر تغییر محاسباتی باید موارد زیر را حفظ کند.

| متغیر / قاعده | مالک canonical | قرارداد |
|---|---|---|
| تنظیمات پروژه، ارز پایه، افق و مبنا | `ProjectSetup`؛ همگام‌سازی در `project-context.tsx` | تنظیمات سناریو و خروجی‌ها مصرف‌کننده‌اند؛ UI فرمول موازی ندارد. |
| نرخ‌های کلان و داده منبع | `MacroAssumptions`؛ اعتبارسنجی و همگام‌سازی در `phase-one-calculations.ts` | مقدار، نوع نرخ، ارز مرجع، تاریخ و منبع مستقل‌اند. enum یا مرجع Excel در UI نمایش داده نمی‌شود. |
| رشد عمومی، مرحله‌ای و اختصاصی | `resolveMacroGrowthRate` و engine مصرف‌کننده | ترتیب انتخاب: نرخ عمومی ثابت → آخرین نرخ مرحله‌ای معتبر تا سال محاسبه → نرخ اختصاصیِ فعال. هر مرحله جای قبلی را می‌گیرد؛ نرخ‌ها جمع نمی‌شوند. نرخ عمومی فقط fallback است. |
| مسیر سناریو و شوک | `scenario-engine.ts` | ترتیب: base → scenario override → sensitivity override یا Monte Carlo perturbation → اجرای همان core engine. هر مرحله یک‌بار اعمال می‌شود. پارامتر شوک کلان به‌تنهایی جریان پایه را تغییر نمی‌دهد. |
| مبنای اسمی / واقعی | `calculateEffectiveDiscountRate` و DCF در `calculations.ts` | جریان اسمی با نرخ اسمی و جریان واقعی با نرخ واقعی Fisher تنزیل می‌شود. تورم در جریان واقعی و تبدیل نرخ دوباره اعمال نمی‌شود. |
| نرخ تنزیل اعمال‌شده | `defaultDiscountRate` از `MacroAssumptions`؛ selector نهایی `calculateEffectiveDiscountRate` | `costOfCapital` نرخ مقایسه‌ای است. ریسک کشور/صنعت/پروژه تشخیصی‌اند و دوباره به WACC یا نرخ اعمالی افزوده نمی‌شوند. DCF، dashboard و report از `outputs.valuation.appliedDiscountRate` مصرف می‌کنند. |
| نرخ ارز قابل اعمال | `calculateFxRateByType` و `calculateFxMappingRates` | نرخ انتخابی ماژول یک‌بار resolve می‌شود. نرخ دستی فقط با نوع «دستی» مصرف می‌شود. fallback یا override دوم در UI/report مجاز نیست. |
| مالیات و معافیت | `tax-capex-engine.ts`؛ پل ورودی `synchronizeTaxAssumptionsFromMacro` | «ندارد» یعنی مدت/نرخ معافیت صفر و خارج از validation. مشوق فقط با نرخ، شروع و مدت صریح اعمال می‌شود. |
| VAT | `MacroAssumptions.vatTreatment` و engine سرمایه در گردش/مالیات | قابل استرداد، قابل تهاتر و غیرقابل‌بازیافت سه وضعیت مستقل‌اند؛ اثر نقدی نباید در tax و working capital دوباره ثبت شود. |
| بیمه و جرائم | `MacroAssumptions` با مبنا و دوره صریح | سهم کارفرما از نرخ کل جداست؛ نرخ جریمه بدون دوره زمانی قابل اعمال نیست. |
| گمرک | نرخ عمومی در `MacroAssumptions`؛ نرخ قلمی در engine اقلام | نرخ قلمی override است و نرخ عمومی fallback؛ هر دو با هم جمع نمی‌شوند. |
| سطح ریسک مجاز | `allowedRiskLevel` | metadata تصمیم‌گیری است و تا تعریف نگاشت عددی مستقل، نرخ یا جریان را تغییر نمی‌دهد. |
| ظرفیت اسمی، واحد و برنامه تولید | `CapacityAssumptions` و `calculateCapacityProduction` | `IndustryTemplate` فقط mirror سازگار و نمایش read-only است؛ ذخیره قالب صنعت ظرفیت یا واحد canonical را بازنویسی نمی‌کند. |
| ظرفیت مؤثر خلاصه قالب صنعت | `calculateOperationalIndicators` با ورودی `CapacityAssumptions` | ظرفیت اسمی × بهره‌برداری سال اول × (۱−ضایعات) × راندمان؛ ظرفیت بلااستفاده = ظرفیت اسمی − همین خروجی. ورودی مستقل `effectiveCapacity` در UI مجاز نیست. |
| بهره‌برداری، راندمان و ضایعات | `CapacityAssumptions` | هر نرخ در تولید فقط یک‌بار اعمال می‌شود. ضریب سناریوی ظرفیت، ظرفیت اسمی را تغییر می‌دهد و نرخ‌های بهره‌برداری را دوباره مقیاس نمی‌کند. |
| نرخ مرجوعی | ماژول بازار/فروش در صورت تعریف canonical آینده | metadata قدیمی قالب صنعت نباید هم تولید و هم فروش خالص را کاهش دهد؛ فعلاً در جریان نقدی اعمال نمی‌شود. |
| رشد ظرفیت | ماژول ظرفیت همراه برنامه توسعه و CAPEX مصوب | metadata قالب صنعت بدون expansion/CAPEX ظرفیت فیزیکی جدید ایجاد نمی‌کند. |
| درآمد | ماژول بازار/فروش و revenue engine | قالب صنعت فقط classification/default اولیه است و مبلغ یا حجم درآمد مستقل تولید نمی‌کند. |
| COGS و OPEX | `DirectCostAssumptions`/`OpexAssumptions` و engineهای مربوط | ساختار هزینه قالب صنعت فقط classification/default اولیه است؛ پیشنهاد تأییدنشده وارد محاسبه نمی‌شود. |
| روزهای وصول و پرداخت | `WorkingCapitalAssumptions` | قالب صنعت فقط mirror read-only است؛ سناریو ابتدا Working Capital را تغییر می‌دهد و سپس mirror را همگام می‌کند. |
| مواجهه ارزی | جریان‌های ارزی قلمی در revenue/COGS/OPEX/CAPEX و resolver نرخ ارز | جدول قالب صنعت metadata طبقه‌بندی است و نباید exposure مستقل دیگری به جریان‌ها اضافه کند. |
| ریسک صنعت | metadata در `IndustryTemplate`؛ شوک عددی فقط در Scenario/Sensitivity/Monte Carlo | سطح/شدت/اطمینان ریسک به‌تنهایی جریان پایه را تغییر نمی‌دهد و multiplier ریسک دوباره روی خروجی باز‌محاسبه‌شده اعمال نمی‌شود. |
| نقش قالب صنعت | `IndustryTemplate` | initializer/default provider و لایه presentation است، نه مالک رقیب محاسبه. انتخاب KPI فقط view state است. |
| null در برابر zero | formatterها و metric statusهای typed | `null`/ثبت‌نشده/ناموجود صفر نیست. فقط صفرِ صریح نمایش و صادر می‌شود؛ خروجی نامعتبر مقدار `null` و status مناسب دارد. |

## چک‌لیست تغییر

- input owner، calculation owner و مصرف‌کنندگان مستقیم مشخص‌اند.
- واحد پول، مقیاس، دوره، سناریو و مبنای قیمت قفل شده‌اند.
- override فقط جایگزین fallback می‌شود و دوباره‌شماری ندارد.
- dashboard و export فقط خروجی typed را مصرف می‌کنند.
- تست مستقیم owner و یک مصرف‌کننده پایین‌دست پاس شده است.
