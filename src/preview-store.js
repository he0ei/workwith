import {empty} from './model.js';
// Read-only, empty UI preview. No Auth token, database, browser storage or fixtures.
export class DesignPreviewStore{
 constructor(){this.preview=true;this.linkAccess=true;}
 async read(){return {state:empty(),versions:{},user:'jh'};}
 async version(){return {revision:0};}
 async change(){throw Error('디자인 미리보기에서는 저장하지 않습니다.');}
 async logout(){}
}
