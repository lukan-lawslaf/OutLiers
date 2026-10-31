export default function OfficeIllustration() {
  return (
    <div className="flat-office" aria-hidden="true">
      <svg viewBox="0 0 760 700" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="boards" width="60" height="100" patternUnits="userSpaceOnUse">
            <path d="M0 0h60v100H0Z" fill="#C6A67B" stroke="#AD8A60" strokeWidth="2" />
          </pattern>
          <pattern id="cork" width="12" height="12" patternUnits="userSpaceOnUse">
            <path d="M0 0h12v12H0Z" fill="#AD8058" />
            <circle cx="3" cy="5" r="1" fill="#9C704C" />
          </pattern>
        </defs>
        <path d="M85 130 415 70 690 205v355L365 660 85 480Z" fill="#233D34" />
        <path d="m85 480 330-95 275 175-325 100Z" fill="url(#boards)" />
        <path d="M415 70v315L85 480V130Z" fill="#2D493D" />
        <path d="m415 70 275 135v355L415 385Z" fill="#233D34" />
        <path d="m131 188 152-30v185l-152 42Z" fill="#72573E" />
        <path d="m142 197 131-26v163l-131 36Z" fill="#36504A" />
        <path d="m208 184 1 166m-65-80 130-31" stroke="#F4EBD5" strokeWidth="9" />
        <path d="m448 165 177 85v141l-177-88Z" fill="#775235" />
        <path d="m459 182 155 74v117l-155-76Z" fill="url(#cork)" />
        <path
          d="m474 210 44 21v38l-44-21Zm77 40 43 21v41l-43-21Zm-59 31 42 19v38l-42-20Z"
          fill="#F4E8CC"
        />
        <path d="m493 217 79 51-57 19" fill="none" stroke="#A44838" strokeWidth="3" />
        <path d="m560 390 102 52v123l-102-59Z" fill="#7A593C" />
        <path d="m570 402 81 41m-81-1 81 43m-81-2 81 44" stroke="#B38A59" strokeWidth="10" />
        <path
          d="m582 413 1 25m17-17 1 25m18-15 1 25m-40 5 1 25m18-16 1 25m17-16 1 25"
          stroke="#AABA8A"
          strokeWidth="10"
        />
        <path d="m177 427 210-60 142 88-207 66Z" fill="#BA8E5B" stroke="#805A39" strokeWidth="8" />
        <path d="M190 439v104m128-30v109m195-168v108" stroke="#805A39" strokeWidth="15" />
        <path d="m282 430 91-26 55 35-92 28Z" fill="#4E6444" />
        <path d="m305 429 51-15 35 23-50 16Z" fill="#FFF5DF" />
        <path
          d="M247 418v-69m-27 0h55l-10-20h-35Z"
          fill="#4E6444"
          stroke="#9D763E"
          strokeWidth="7"
        />
        <ellipse cx="362" cy="565" rx="43" ry="20" fill="#896343" />
        <path
          d="M327 566v48m68-48v42m-67-48v-56q34-25 68 0v56"
          fill="#A17B53"
          stroke="#7D5839"
          strokeWidth="8"
        />
        <path d="m132 438 32-8 19 55-35 11Z" fill="#AE7154" />
        <path d="m154 439 2-82m0 39-26-16m26-4 26-21" stroke="#4E6444" strokeWidth="10" />
        <ellipse cx="130" cy="377" rx="13" ry="24" fill="#6F8453" transform="rotate(-35 130 377)" />
        <ellipse cx="181" cy="351" rx="14" ry="25" fill="#6F8453" transform="rotate(32 181 351)" />
      </svg>
    </div>
  );
}
