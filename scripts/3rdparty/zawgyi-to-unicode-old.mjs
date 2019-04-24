// JavaScript Document
// Version : 1.0
// Author : The` The` Aye
// Release : August 07, 2009
// Name : ZawgyiOne to Unicode 5.1 Converter
function ZawgyiToUnicode(zgtext) {
   let utext = zgtext;

   utext =  utext.replace( /\u106A/g, " \u1009");
   utext =  utext.replace( /\u1025(?=[\u1039\u102C])/g, "\u1009");
   // new
   utext =  utext.replace( /\u1025\u102E/g, "\u1026");
   // new
   utext =  utext.replace( /\u106B/g, "\u100A");
   utext =  utext.replace( /\u1090/g, "\u101B");
   utext =  utext.replace( /\u1040/g, "\u1040");

   utext =  utext.replace( /\u108F/g, "\u1014");
   utext =  utext.replace( /\u1012/g, "\u1012");
   utext =  utext.replace( /\u1013/g, "\u1013");
   /////////////

   utext =  utext.replace( /[\u103D\u1087]/g, "\u103E");
   // ha
   utext =  utext.replace( /\u103C/g, "\u103D");
   // wa
   utext =  utext.replace( /[\u103B\u107E\u107F\u1080\u1081\u1082\u1083\u1084]/g, "\u103C");
   // ya yint(ra)
   utext =  utext.replace( /[\u103A\u107D]/g, "\u103B");
   // ya

   utext =  utext.replace( /\u103E\u103B/g, "\u103B" + "\u103E");
   // reorder

   utext =  utext.replace( /\u108A/g, "\u103D" + "\u103E");
   // wa ha

   ////////////////////// Reordering

   utext =  utext.replace( /(\u1031)?(\u103C)?([\u1000-\u1021])\u1064/g, "\u1064$1$2$3");
   // reordering kinzi
   utext =  utext.replace( /(\u1031)?(\u103C)?([\u1000-\u1021])\u108B/g, "\u1064$1$2$3\u102D");
   // reordering kinzi lgt
   utext =  utext.replace( /(\u1031)?(\u103C)?([\u1000-\u1021])\u108C/g, "\u1064$1$2$3\u102E");
   // reordering kinzi lgtsk
   utext =  utext.replace( /(\u1031)?(\u103C)?([\u1000-\u1021])\u108D/g, "\u1064$1$2$3\u1036");
   // reordering kinzi ttt

   ////////////////////////////////////////

   utext =  utext.replace( /\u105A/g, "\u102B" + "\u103A");
   utext =  utext.replace( /\u108E/g, "\u102D" + "\u1036");
   // lgt ttt
   utext =  utext.replace( /\u1033/g, "\u102F");
   utext =  utext.replace( /\u1034/g, "\u1030");
   utext =  utext.replace( /\u1088/g, "\u103E" + "\u102F");
   // ha  u
   utext =  utext.replace( /\u1089/g, "\u103E" + "\u1030");
   // ha  uu
   ///////////////////////////////////////

   utext =  utext.replace( /\u1039/g, "\u103A");
   utext =  utext.replace( /[\u1094\u1095]/g, "\u1037");
   // aukmyint

   /////////////////////////////////////// Pasint order human error
   utext =  utext.replace( /([\u1000-\u1021])([\u102C\u102D\u102E\u1032\u1036]){1,2}([\u1060\u1061\u1062\u1063\u1065\u1066\u1067\u1068\u1069\u1070\u1071\u1072\u1073\u1074\u1075\u1076\u1077\u1078\u1079\u107A\u107B\u107C\u1085])/g, "$1$3$2");
   // new
   /////////////

   utext =  utext.replace( /\u1064/g, "\u1004\u103A\u1039");

   utext =  utext.replace( /\u104E/g, "\u104E\u1004\u103A\u1038");

   utext =  utext.replace( /\u1086/g, "\u103F");

   utext =  utext.replace( /\u1060/g, '\u1039\u1000');
   utext =  utext.replace( /\u1061/g, '\u1039\u1001');
   utext =  utext.replace( /\u1062/g, '\u1039\u1002');
   utext =  utext.replace( /\u1063/g, '\u1039\u1003');
   utext =  utext.replace( /\u1065/g, '\u1039\u1005');
   utext =  utext.replace( /[\u1066\u1067]/g, '\u1039\u1006');
   utext =  utext.replace( /\u1068/g, '\u1039\u1007');
   utext =  utext.replace( /\u1069/g, '\u1039\u1008');
   utext =  utext.replace( /\u106C/g, '\u1039\u100B');
   utext =  utext.replace( /\u1070/g, '\u1039\u100F');
   utext =  utext.replace( /[\u1071\u1072]/g, '\u1039\u1010');
   utext =  utext.replace( /[\u1073\u1074]/g, '\u1039\u1011');
   utext =  utext.replace( /\u1075/g, '\u1039\u1012');
   utext =  utext.replace( /\u1076/g, '\u1039\u1013');
   utext =  utext.replace( /\u1077/g, '\u1039\u1014');
   utext =  utext.replace( /\u1078/g, '\u1039\u1015');
   utext =  utext.replace( /\u1079/g, '\u1039\u1016');
   utext =  utext.replace( /\u107A/g, '\u1039\u1017');
   utext =  utext.replace( /\u107B/g, '\u1039\u1018');
   utext =  utext.replace( /\u107C/g, '\u1039\u1019');
   utext =  utext.replace( /\u1085/g, '\u1039\u101C');
   utext =  utext.replace( /\u106D/g, '\u1039\u100C');

   utext =  utext.replace( /\u1091/g, '\u100F\u1039\u100D');
   utext =  utext.replace( /\u1092/g, '\u100B\u1039\u100C');
   utext =  utext.replace( /\u1097/g, '\u100B\u1039\u100B');
   utext =  utext.replace( /\u106F/g, '\u100E\u1039\u100D');
   utext =  utext.replace( /\u106E/g, '\u100D\u1039\u100D');

   /////////////////////////////////////////////////////////

   utext =  utext.replace( /(\u103C)([\u1000-\u1021])(\u1039[\u1000-\u1021])?/g, "$2$3$1");
   // reordering ra

   utext =  utext.replace( /(\u103E)(\u103D)([\u103B\u103C])/g, "$3$2$1");
   utext =  utext.replace( /(\u103E)([\u103B\u103C])/g, "$2$1");

   utext =  utext.replace( /(\u103D)([\u103B\u103C])/g, "$2$1");

   utext = utext.replace(/(([\u1000-\u101C\u101D\u101E-\u102A\u102C\u102E-\u103F\u104C-\u109F]))(\u1040)/g, function($0, $1) {
      return $1 ? $1 + '\u101D' : $0 + $1;
   });
   // zero and wa  
   utext = utext.replace(/(\u1040)(?=([\u1040\u1047])*([\u1000-\u101C\u101D\u101E-\u102A\u102C\u102E-\u103F\u104C-\u109F]))/g,  "\u101D");   // zero and wa
 
   utext = utext.replace(/(([\u1000-\u101C\u101D\u101E-\u102A\u102C\u102E-\u103F\u104C-\u109F]))(\u1047)/g, function($0, $1) {
      return $1 ? $1 + '\u101B' : $0 + $1;
   });
   // seven and ra
   utext = utext.replace(/(\u1047)(?=([\u1047])*([\u1000-\u101C\u101D\u101E-\u102A\u102C\u102E-\u103F\u104C-\u109F]))/g,  "\u101B");   // seven and ra

   utext =  utext.replace( /(\u1031)?([\u1000-\u1021])(\u1039[\u1000-\u1021])?([\u102D\u102E\u1032])?([\u1036\u1037\u1038]{0,2})([\u103B-\u103E]{0,3})([\u102F\u1030])?([\u1036\u1037\u1038]{0,2})([\u102D\u102E\u1032])?/g, "$2$3$6$1$4$9$7$5$8");
   // reordering storage order

   utext =  utext.replace( /(\u103A)(\u1037)/g, "$2$1");
   // For Latest Myanmar3
   
   utext =  utext.replace( /(\u1036)(\u102F)/g, "$2$1");
   // For Latest Myanmar3

   return utext;
}

export { ZawgyiToUnicode };