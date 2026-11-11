import type {Express,Request} from 'express';
import { stationVoteState,voteForStation } from '../data/station-vote-store';

export function registerStationVoteRoutes(app:Express, authenticatedUserId:(req:Request)=>Promise<string|undefined>) {
  app.get('/api/stations/:id/vote',async(req,res)=>{
    res.set('Cache-Control','private, no-store');
    try {
      const result=await stationVoteState(String(req.params.id),await authenticatedUserId(req));
      if(!result) return void res.status(404).json({error:'Station not found'});
      res.json(result);
    } catch { res.status(500).json({error:'Failed to read vote'}); }
  });
  app.post('/api/stations/:id/vote',async(req,res)=>{
    res.set('Cache-Control','private, no-store');
    try {
      const userId=await authenticatedUserId(req);
      if(!userId) return void res.status(401).json({code:'LOGIN_REQUIRED',error:'Sign in to vote'});
      const result=await voteForStation(String(req.params.id),userId);
      if(!result) return void res.status(404).json({error:'Station not found'});
      res.json(result);
    } catch { res.status(500).json({error:'Failed to vote for station'}); }
  });
}
