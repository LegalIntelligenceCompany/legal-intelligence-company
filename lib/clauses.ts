export function readClause(body: string): {text:string;usage:string;approved:boolean} {
  try {
    const v = JSON.parse(body);
    if (v && v.type === 'lic-clause-v1' && typeof v.text === 'string' && typeof v.usage === 'string' && typeof v.approved === 'boolean') return v;
  } catch { /* Older plain-text notes remain readable, never implicitly approved. */ }
  return {text:body, usage:'', approved:false};
}
