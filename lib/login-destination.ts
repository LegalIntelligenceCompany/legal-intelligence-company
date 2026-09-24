const destinations=new Set(['/chat','/billing','/credits','/settings','/usage','/library','/team','/tools','/contracts']);
export function loginDestination(value:string|null|undefined){return value&&destinations.has(value)?value:'/dashboard';}
