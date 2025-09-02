import type { forms_v1 } from "googleapis";

export type FormAnswer =
    | string
    | Array<forms_v1.Schema$FileUploadAnswer>
    | null;

export interface FormResponse {
    id: string | null | undefined,
    timestamp: string | null | undefined,
    answers: Record<string, FormAnswer>,
}

export interface GptOutput {
    id: string,
    images: string,
    headline: string,
    teaser: string,
    body: string,
    delivery_info: {
        high_school: string,
        publication: string,
        sport: string,
        game_date: string,
        sex: string,
        opportunity: string,
        opportunity_type: string,
        content_type: string,
        limpar_org_id: string,
    }
}

export type PublishedStoryData = {
    id: string,
    storyId: number,
    high_school: string,
    publication: string,
    sport: string,
    sex: string,
    game_date: string,
    isInSheet?: boolean
}

export type LimparFactoid = {
    sex?: string,
    score?: string,
    sport?: string,
    school?: string,
    game_type?: string,
    location?: string,
    game_date?: string,
    game_uuid?: string,
    next_event?: string,
    venue_name?: string,
    pl_story_url?: string,
    opposing_team?: string,
    season_record?: string,
    key_team_stats?: string,
    which_team_won?: string,
    head_coach_name?: string,
    matchup_history?: string,
    noteworthy_game?: string,
    head_coach_quote?: string,
    competitive_stage?: string,
    pl_story_headline?: string,
    top_individual_players?: string,
    anything_else_about_game?: string,
    standout_plays_or_noteworthy_sequences?: string
} & {
    [K in `photo_${1 | 2 | 3 | 4 | 5}`]?: string
};
